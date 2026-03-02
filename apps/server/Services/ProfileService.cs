using System.Text.RegularExpressions;
using Bga2.Server.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Bga2.Server.Services;

/// <summary>
/// Response model for GET /social/profile/{username}.
/// </summary>
public record ProfileResponse(
    string Username,
    string DisplayName,
    string Avatar,
    DateTime MemberSince,
    int GamesPlayed,
    double WinRate,
    bool IsPublic
);

/// <summary>
/// A single match history entry for a player.
/// </summary>
public record MatchHistoryItem(
    string GameId,
    bool Won,
    int Score,
    int Rank,
    string[] Opponents,
    DateTime CompletedAt,
    int PlayerCount
);

/// <summary>
/// Result of a username change attempt.
/// </summary>
public record UsernameChangeResult(bool Success, string? Error = null, int? RetryAfterDays = null);

/// <summary>
/// Request body for PUT /social/profile.
/// </summary>
public record UpdateProfileRequest(string? Avatar = null, bool? IsPublic = null);

/// <summary>
/// Game end data extracted from game state for match result recording.
/// </summary>
public record PlayerEndData(string UserId, int Score, int Rank, bool Won);

/// <summary>
/// Manages user profiles, stats aggregation, avatar selection, and match history.
///
/// Better Auth owns the `user` table — ProfileService uses raw SQL to read/write
/// username and other auth fields. C# EF Core manages only UserProfile extension records.
/// </summary>
public class ProfileService
{
    private readonly GameDbContext _db;
    private readonly ILogger<ProfileService> _logger;

    /// <summary>
    /// 16 preset avatar identifiers. Client maps these to emoji/SVG icons.
    /// </summary>
    public static readonly string[] PresetAvatars =
    [
        "knight", "wizard", "dragon", "phoenix",
        "castle", "crown", "shield", "sword",
        "dice", "pawn", "rook", "queen",
        "joker", "crystal", "scroll", "compass"
    ];

    private static readonly Regex UsernameRegex = new(@"^[a-zA-Z0-9_]{3,20}$", RegexOptions.Compiled);

    public ProfileService(GameDbContext db, ILogger<ProfileService> logger)
    {
        _db = db;
        _logger = logger;
    }

    /// <summary>
    /// Gets a user profile by username.
    /// Queries Better Auth's `user` table for identity, EF Core for profile extension.
    /// If no UserProfile row exists, returns default values (avatar="default", isPublic=true).
    /// </summary>
    public async Task<ProfileResponse?> GetProfile(string username, string? viewerUserId = null)
    {
        // Query Better Auth user table via raw SQL
        var conn = _db.Database.GetDbConnection();
        await conn.OpenAsync();

        try
        {
            string? userId = null;
            string? displayName = null;
            DateTime memberSince = DateTime.UtcNow;

            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"SELECT id, name, username, ""createdAt"" FROM ""user"" WHERE username = @username";
                var param = cmd.CreateParameter();
                param.ParameterName = "username";
                param.Value = username;
                cmd.Parameters.Add(param);

                using var reader = await cmd.ExecuteReaderAsync();
                if (!await reader.ReadAsync())
                    return null;

                userId = reader.GetString(0);
                displayName = reader.GetString(1);
                memberSince = reader.GetDateTime(3);
            }

            // Load profile extension (may not exist — use defaults)
            var profile = await _db.UserProfiles.FirstOrDefaultAsync(p => p.UserId == userId);
            var avatar = profile?.Avatar ?? "default";
            var isPublic = profile?.IsPublic ?? true;

            // If profile is private and viewer is not the owner, return limited info
            if (!isPublic && viewerUserId != userId)
            {
                return new ProfileResponse(
                    Username: username,
                    DisplayName: displayName ?? username,
                    Avatar: avatar,
                    MemberSince: memberSince,
                    GamesPlayed: 0,
                    WinRate: 0.0,
                    IsPublic: false
                );
            }

            // Aggregate stats from MatchResult
            var matchStats = await _db.MatchResults
                .Where(m => m.UserId == userId)
                .GroupBy(m => m.UserId)
                .Select(g => new
                {
                    GamesPlayed = g.Count(),
                    Wins = g.Count(m => m.Won)
                })
                .FirstOrDefaultAsync();

            var gamesPlayed = matchStats?.GamesPlayed ?? 0;
            var winRate = gamesPlayed > 0 ? (double)(matchStats!.Wins) / gamesPlayed * 100.0 : 0.0;

            return new ProfileResponse(
                Username: username,
                DisplayName: displayName ?? username,
                Avatar: avatar,
                MemberSince: memberSince,
                GamesPlayed: gamesPlayed,
                WinRate: Math.Round(winRate, 1),
                IsPublic: isPublic
            );
        }
        finally
        {
            await conn.CloseAsync();
        }
    }

    /// <summary>
    /// Returns paginated match history for a user (by userId).
    /// Includes opponent names by looking up other MatchResults with the same SessionId.
    /// </summary>
    public async Task<List<MatchHistoryItem>> GetMatchHistory(string userId, int page = 1, int pageSize = 20)
    {
        var skip = (page - 1) * pageSize;

        var results = await _db.MatchResults
            .Where(m => m.UserId == userId)
            .OrderByDescending(m => m.CompletedAt)
            .Skip(skip)
            .Take(pageSize)
            .ToListAsync();

        if (results.Count == 0)
            return [];

        // Collect all sessionIds to look up opponents in one query
        var sessionIds = results.Select(r => r.SessionId).Distinct().ToList();

        // Load all MatchResults for these sessions (to find opponents)
        var allResultsForSessions = await _db.MatchResults
            .Where(m => sessionIds.Contains(m.SessionId) && m.UserId != userId)
            .ToListAsync();

        // Load opponent usernames from Better Auth user table via raw SQL
        var opponentUserIds = allResultsForSessions.Select(r => r.UserId).Distinct().ToList();
        var usernameMap = new Dictionary<string, string>();

        if (opponentUserIds.Count > 0)
        {
            var conn = _db.Database.GetDbConnection();
            await conn.OpenAsync();
            try
            {
                using var cmd = conn.CreateCommand();
                // Build parameterized IN clause
                var paramNames = opponentUserIds.Select((_, i) => $"@uid{i}").ToList();
                cmd.CommandText = $@"SELECT id, username FROM ""user"" WHERE id IN ({string.Join(",", paramNames)})";
                for (int i = 0; i < opponentUserIds.Count; i++)
                {
                    var p = cmd.CreateParameter();
                    p.ParameterName = $"uid{i}";
                    p.Value = opponentUserIds[i];
                    cmd.Parameters.Add(p);
                }

                using var reader = await cmd.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var uid = reader.GetString(0);
                    var uname = reader.IsDBNull(1) ? uid : reader.GetString(1);
                    usernameMap[uid] = uname;
                }
            }
            finally
            {
                await conn.CloseAsync();
            }
        }

        // Build history items
        return results.Select(r =>
        {
            var opponents = allResultsForSessions
                .Where(o => o.SessionId == r.SessionId)
                .Select(o => usernameMap.TryGetValue(o.UserId, out var name) ? name : o.UserId)
                .ToArray();

            return new MatchHistoryItem(
                GameId: r.GameId,
                Won: r.Won,
                Score: r.Score,
                Rank: r.Rank,
                Opponents: opponents,
                CompletedAt: r.CompletedAt,
                PlayerCount: r.PlayerCount
            );
        }).ToList();
    }

    /// <summary>
    /// Upserts a UserProfile record for the given userId.
    /// Validates avatar against preset list.
    /// Returns false if avatar is invalid.
    /// </summary>
    public async Task<bool> UpdateProfile(string userId, UpdateProfileRequest req)
    {
        if (req.Avatar != null && req.Avatar != "default" && !PresetAvatars.Contains(req.Avatar))
        {
            _logger.LogWarning("Invalid avatar '{Avatar}' rejected for user {UserId}", req.Avatar, userId);
            return false;
        }

        var profile = await _db.UserProfiles.FindAsync(userId);
        if (profile == null)
        {
            profile = new UserProfile
            {
                UserId = userId,
                Avatar = req.Avatar ?? "default",
                IsPublic = req.IsPublic ?? true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _db.UserProfiles.Add(profile);
        }
        else
        {
            if (req.Avatar != null) profile.Avatar = req.Avatar;
            if (req.IsPublic.HasValue) profile.IsPublic = req.IsPublic.Value;
            profile.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        return true;
    }

    /// <summary>
    /// Changes a user's username with uniqueness validation and 30-day cooldown.
    ///
    /// Validates format (3-20 chars, alphanumeric + underscores),
    /// checks uniqueness in Better Auth's `user` table,
    /// enforces 30-day cooldown via UserProfile.UsernameChangedAt,
    /// then updates username in Better Auth's `user` table via raw SQL.
    /// </summary>
    public async Task<UsernameChangeResult> UpdateUsername(string userId, string newUsername)
    {
        // Format validation
        if (!UsernameRegex.IsMatch(newUsername))
        {
            return new UsernameChangeResult(false, "Username must be 3-20 characters (letters, numbers, underscores only)");
        }

        var conn = _db.Database.GetDbConnection();
        await conn.OpenAsync();

        try
        {
            // Check uniqueness
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"SELECT COUNT(*) FROM ""user"" WHERE username = @newUsername AND id != @userId";
                var p1 = cmd.CreateParameter(); p1.ParameterName = "newUsername"; p1.Value = newUsername; cmd.Parameters.Add(p1);
                var p2 = cmd.CreateParameter(); p2.ParameterName = "userId"; p2.Value = userId; cmd.Parameters.Add(p2);
                var count = (long)(await cmd.ExecuteScalarAsync() ?? 0L);
                if (count > 0)
                    return new UsernameChangeResult(false, "Username is already taken");
            }

            // Check cooldown
            var profile = await _db.UserProfiles.FindAsync(userId);
            if (profile?.UsernameChangedAt != null)
            {
                var daysSinceChange = (DateTime.UtcNow - profile.UsernameChangedAt.Value).TotalDays;
                if (daysSinceChange < 30)
                {
                    var daysRemaining = (int)Math.Ceiling(30 - daysSinceChange);
                    return new UsernameChangeResult(false, $"You can change your username again in {daysRemaining} days", daysRemaining);
                }
            }

            // Update username in Better Auth's user table
            using (var cmd = conn.CreateCommand())
            {
                cmd.CommandText = @"UPDATE ""user"" SET username = @newUsername WHERE id = @userId";
                var p1 = cmd.CreateParameter(); p1.ParameterName = "newUsername"; p1.Value = newUsername; cmd.Parameters.Add(p1);
                var p2 = cmd.CreateParameter(); p2.ParameterName = "userId"; p2.Value = userId; cmd.Parameters.Add(p2);
                await cmd.ExecuteNonQueryAsync();
            }
        }
        finally
        {
            await conn.CloseAsync();
        }

        // Update UsernameChangedAt in UserProfile
        var existingProfile = await _db.UserProfiles.FindAsync(userId);
        if (existingProfile == null)
        {
            existingProfile = new UserProfile
            {
                UserId = userId,
                UsernameChangedAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _db.UserProfiles.Add(existingProfile);
        }
        else
        {
            existingProfile.UsernameChangedAt = DateTime.UtcNow;
            existingProfile.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();

        _logger.LogInformation("Username changed for user {UserId} to '{NewUsername}'", userId, newUsername);
        return new UsernameChangeResult(true);
    }

    /// <summary>
    /// Records a MatchResult per player when a game ends.
    /// Called from GameService after detecting finished==true in game state.
    /// </summary>
    public async Task RecordMatchResults(Guid sessionId, string gameId, List<PlayerEndData> players)
    {
        var now = DateTime.UtcNow;
        var entries = players.Select(p => new MatchResult
        {
            Id = Guid.NewGuid(),
            SessionId = sessionId,
            UserId = p.UserId,
            GameId = gameId,
            Won = p.Won,
            Score = p.Score,
            Rank = p.Rank,
            PlayerCount = players.Count,
            CompletedAt = now
        });

        _db.MatchResults.AddRange(entries);
        await _db.SaveChangesAsync();

        _logger.LogInformation(
            "Recorded {Count} match results for session {SessionId} game {GameId}",
            players.Count, sessionId, gameId);
    }

    /// <summary>
    /// Looks up a user's ID by their username (raw SQL against Better Auth's user table).
    /// Returns null if not found.
    /// </summary>
    public async Task<string?> GetUserIdByUsername(string username)
    {
        var conn = _db.Database.GetDbConnection();
        await conn.OpenAsync();
        try
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"SELECT id FROM ""user"" WHERE username = @username";
            var p = cmd.CreateParameter(); p.ParameterName = "username"; p.Value = username; cmd.Parameters.Add(p);
            var result = await cmd.ExecuteScalarAsync();
            return result as string;
        }
        finally
        {
            await conn.CloseAsync();
        }
    }
}
