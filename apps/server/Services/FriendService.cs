using System.Collections.Concurrent;
using Bga2.Server.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Bga2.Server.Services;

// ─── Response models ──────────────────────────────────────────────────────────

/// <summary>Result of a user search query.</summary>
public record UserSearchResult(string UserId, string Username, string DisplayName);

/// <summary>Result of sending a friend request.</summary>
public record FriendRequestResult(bool Success, string? Error = null);

/// <summary>A resolved friend entry with online status.</summary>
public record FriendInfo(
    Guid FriendshipId,
    string UserId,
    string Username,
    string DisplayName,
    string Avatar,
    bool IsOnline,
    DateTime FriendSince
);

/// <summary>A pending friend request (incoming or outgoing).</summary>
public record FriendRequestInfo(
    Guid FriendshipId,
    string UserId,
    string Username,
    string DisplayName,
    string Avatar,
    DateTime RequestedAt
);

/// <summary>Pending requests split into incoming and outgoing.</summary>
public record PendingRequests(
    List<FriendRequestInfo> Incoming,
    List<FriendRequestInfo> Outgoing
);

// ─── Service ──────────────────────────────────────────────────────────────────

/// <summary>
/// Manages friend requests, friendships, user search, and online presence tracking.
///
/// Online presence uses an in-memory ConcurrentDictionary keyed by userId.
/// Last-seen timestamps are updated on authenticated API calls via middleware.
/// IsOnline = lastSeen within 60 seconds. State is lost on server restart —
/// acceptable for development; production would use Redis or DynamoDB TTL.
/// </summary>
public class FriendService
{
    private readonly GameDbContext _db;
    private readonly ILogger<FriendService> _logger;

    /// <summary>
    /// In-memory presence store. Key = userId, Value = last seen UTC timestamp.
    /// Static so it persists across DI-scoped instances.
    /// </summary>
    private static readonly ConcurrentDictionary<string, DateTime> _lastSeen = new();

    private static readonly TimeSpan OnlineThreshold = TimeSpan.FromSeconds(60);

    public FriendService(GameDbContext db, ILogger<FriendService> logger)
    {
        _db = db;
        _logger = logger;
    }

    // ─── Online presence ──────────────────────────────────────────────────────

    /// <summary>
    /// Update the last-seen timestamp for a user.
    /// Called from authenticated API middleware to track online status.
    /// </summary>
    public void UpdateLastSeen(string userId)
    {
        _lastSeen[userId] = DateTime.UtcNow;
    }

    /// <summary>
    /// Returns true if the user was seen within the online threshold.
    /// </summary>
    public bool IsOnline(string userId)
    {
        if (_lastSeen.TryGetValue(userId, out var lastSeen))
            return DateTime.UtcNow - lastSeen <= OnlineThreshold;
        return false;
    }

    // ─── User search ──────────────────────────────────────────────────────────

    /// <summary>
    /// Search for users by username prefix (case-insensitive).
    /// Excludes the searching user and users who have blocked them.
    /// Returns up to 10 results.
    /// </summary>
    public async Task<List<UserSearchResult>> SearchUsers(string query, string excludeUserId)
    {
        if (string.IsNullOrWhiteSpace(query) || query.Length < 2)
            return [];

        // Find users who have blocked the searcher (to exclude from results)
        var blockedByUserIds = await _db.Friendships
            .Where(f => f.AddresseeId == excludeUserId && f.Status == FriendshipStatus.Blocked)
            .Select(f => f.RequesterId)
            .ToListAsync();

        var conn = _db.Database.GetDbConnection();
        await conn.OpenAsync();
        try
        {
            using var cmd = conn.CreateCommand();
            cmd.CommandText = @"
                SELECT id, username, name
                FROM ""user""
                WHERE username ILIKE @q
                  AND id != @exclude
                LIMIT 10";

            var pQ = cmd.CreateParameter(); pQ.ParameterName = "q"; pQ.Value = $"{query}%"; cmd.Parameters.Add(pQ);
            var pEx = cmd.CreateParameter(); pEx.ParameterName = "exclude"; pEx.Value = excludeUserId; cmd.Parameters.Add(pEx);

            var results = new List<UserSearchResult>();
            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var uid = reader.GetString(0);
                // Skip users who have blocked the searcher
                if (blockedByUserIds.Contains(uid)) continue;
                var username = reader.IsDBNull(1) ? "" : reader.GetString(1);
                var name = reader.IsDBNull(2) ? username : reader.GetString(2);
                results.Add(new UserSearchResult(uid, username, name));
            }
            return results;
        }
        finally
        {
            await conn.CloseAsync();
        }
    }

    // ─── Friend requests ──────────────────────────────────────────────────────

    /// <summary>
    /// Send a friend request from requesterId to the user with the given username.
    /// Checks for existing friendships/blocks in both directions.
    /// </summary>
    public async Task<FriendRequestResult> SendRequest(string requesterId, string addresseeUsername)
    {
        // Look up addressee by username
        var addresseeId = await GetUserIdByUsernameInternal(addresseeUsername);
        if (addresseeId == null)
            return new FriendRequestResult(false, $"User '{addresseeUsername}' not found");

        if (addresseeId == requesterId)
            return new FriendRequestResult(false, "You cannot add yourself as a friend");

        // Check for any existing friendship in either direction
        var existing = await _db.Friendships.FirstOrDefaultAsync(f =>
            (f.RequesterId == requesterId && f.AddresseeId == addresseeId) ||
            (f.RequesterId == addresseeId && f.AddresseeId == requesterId));

        if (existing != null)
        {
            return existing.Status switch
            {
                FriendshipStatus.Accepted => new FriendRequestResult(false, "You are already friends"),
                FriendshipStatus.Pending => new FriendRequestResult(false, "A friend request already exists"),
                FriendshipStatus.Blocked => new FriendRequestResult(false, "Unable to send request"),
                _ => new FriendRequestResult(false, "Unable to send request")
            };
        }

        var friendship = new Friendship
        {
            Id = Guid.NewGuid(),
            RequesterId = requesterId,
            AddresseeId = addresseeId,
            Status = FriendshipStatus.Pending,
            CreatedAt = DateTime.UtcNow,
        };

        _db.Friendships.Add(friendship);
        await _db.SaveChangesAsync();

        _logger.LogInformation("Friend request sent: {RequesterId} -> {AddresseeId}", requesterId, addresseeId);
        return new FriendRequestResult(true);
    }

    /// <summary>
    /// Accept a pending friend request. Only the addressee can accept.
    /// </summary>
    public async Task<bool> AcceptRequest(string addresseeId, Guid friendshipId)
    {
        var friendship = await _db.Friendships.FindAsync(friendshipId);
        if (friendship == null || friendship.Status != FriendshipStatus.Pending || friendship.AddresseeId != addresseeId)
            return false;

        friendship.Status = FriendshipStatus.Accepted;
        friendship.AcceptedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        _logger.LogInformation("Friend request accepted: {FriendshipId}", friendshipId);
        return true;
    }

    /// <summary>
    /// Decline a pending friend request. Only the addressee can decline (deletes the row).
    /// </summary>
    public async Task<bool> DeclineRequest(string addresseeId, Guid friendshipId)
    {
        var friendship = await _db.Friendships.FindAsync(friendshipId);
        if (friendship == null || friendship.AddresseeId != addresseeId)
            return false;

        _db.Friendships.Remove(friendship);
        await _db.SaveChangesAsync();
        return true;
    }

    /// <summary>
    /// Remove a friend (either party can remove). Deletes the Friendship row.
    /// </summary>
    public async Task<bool> RemoveFriend(string userId, Guid friendshipId)
    {
        var friendship = await _db.Friendships.FindAsync(friendshipId);
        if (friendship == null) return false;

        // Either party can remove
        if (friendship.RequesterId != userId && friendship.AddresseeId != userId)
            return false;

        _db.Friendships.Remove(friendship);
        await _db.SaveChangesAsync();
        return true;
    }

    /// <summary>
    /// Block a user. Updates existing friendship to Blocked, or creates a Blocked row.
    /// </summary>
    public async Task<bool> BlockUser(string userId, string blockedUserId)
    {
        if (userId == blockedUserId) return false;

        var existing = await _db.Friendships.FirstOrDefaultAsync(f =>
            (f.RequesterId == userId && f.AddresseeId == blockedUserId) ||
            (f.RequesterId == blockedUserId && f.AddresseeId == userId));

        if (existing != null)
        {
            existing.Status = FriendshipStatus.Blocked;
            // Normalise: blocker = requesterId, blocked = addresseeId
            existing.RequesterId = userId;
            existing.AddresseeId = blockedUserId;
        }
        else
        {
            _db.Friendships.Add(new Friendship
            {
                Id = Guid.NewGuid(),
                RequesterId = userId,
                AddresseeId = blockedUserId,
                Status = FriendshipStatus.Blocked,
                CreatedAt = DateTime.UtcNow,
            });
        }

        await _db.SaveChangesAsync();
        return true;
    }

    // ─── Friends list ─────────────────────────────────────────────────────────

    /// <summary>
    /// Get accepted friends for a user. Includes online status from in-memory store.
    /// </summary>
    public async Task<List<FriendInfo>> GetFriends(string userId)
    {
        var friendships = await _db.Friendships
            .Where(f => f.Status == FriendshipStatus.Accepted &&
                        (f.RequesterId == userId || f.AddresseeId == userId))
            .ToListAsync();

        if (friendships.Count == 0) return [];

        // Collect friend user IDs
        var friendUserIds = friendships
            .Select(f => f.RequesterId == userId ? f.AddresseeId : f.RequesterId)
            .Distinct()
            .ToList();

        // Fetch friend details from Better Auth user table + UserProfile
        var userDetails = await GetUserDetailsBatch(friendUserIds);
        var profiles = await _db.UserProfiles
            .Where(p => friendUserIds.Contains(p.UserId))
            .ToDictionaryAsync(p => p.UserId, p => p.Avatar);

        return friendships.Select(f =>
        {
            var friendId = f.RequesterId == userId ? f.AddresseeId : f.RequesterId;
            userDetails.TryGetValue(friendId, out var details);
            profiles.TryGetValue(friendId, out var avatar);
            return new FriendInfo(
                FriendshipId: f.Id,
                UserId: friendId,
                Username: details?.Username ?? friendId,
                DisplayName: details?.DisplayName ?? friendId,
                Avatar: avatar ?? "default",
                IsOnline: IsOnline(friendId),
                FriendSince: f.AcceptedAt ?? f.CreatedAt
            );
        }).ToList();
    }

    /// <summary>
    /// Get pending friend requests split into incoming (addressee == userId) and outgoing (requester == userId).
    /// </summary>
    public async Task<PendingRequests> GetPendingRequests(string userId)
    {
        var all = await _db.Friendships
            .Where(f => f.Status == FriendshipStatus.Pending &&
                        (f.RequesterId == userId || f.AddresseeId == userId))
            .ToListAsync();

        var incomingFriendships = all.Where(f => f.AddresseeId == userId).ToList();
        var outgoingFriendships = all.Where(f => f.RequesterId == userId).ToList();

        // Collect all user IDs to fetch in one batch
        var allUserIds = incomingFriendships.Select(f => f.RequesterId)
            .Concat(outgoingFriendships.Select(f => f.AddresseeId))
            .Distinct()
            .ToList();

        var userDetails = await GetUserDetailsBatch(allUserIds);
        var profiles = await _db.UserProfiles
            .Where(p => allUserIds.Contains(p.UserId))
            .ToDictionaryAsync(p => p.UserId, p => p.Avatar);

        FriendRequestInfo ToInfo(Friendship f, string otherUserId)
        {
            userDetails.TryGetValue(otherUserId, out var details);
            profiles.TryGetValue(otherUserId, out var avatar);
            return new FriendRequestInfo(
                FriendshipId: f.Id,
                UserId: otherUserId,
                Username: details?.Username ?? otherUserId,
                DisplayName: details?.DisplayName ?? otherUserId,
                Avatar: avatar ?? "default",
                RequestedAt: f.CreatedAt
            );
        }

        return new PendingRequests(
            Incoming: incomingFriendships.Select(f => ToInfo(f, f.RequesterId)).ToList(),
            Outgoing: outgoingFriendships.Select(f => ToInfo(f, f.AddresseeId)).ToList()
        );
    }

    // ─── Internal helpers ──────────────────────────────────────────────────────

    private record UserDetails(string Username, string DisplayName);

    /// <summary>
    /// Batch fetch username + name for a list of user IDs from Better Auth's user table.
    /// </summary>
    private async Task<Dictionary<string, UserDetails>> GetUserDetailsBatch(List<string> userIds)
    {
        if (userIds.Count == 0) return [];

        var result = new Dictionary<string, UserDetails>();
        var conn = _db.Database.GetDbConnection();
        await conn.OpenAsync();
        try
        {
            using var cmd = conn.CreateCommand();
            var paramNames = userIds.Select((_, i) => $"@uid{i}").ToList();
            cmd.CommandText = $@"SELECT id, username, name FROM ""user"" WHERE id IN ({string.Join(",", paramNames)})";
            for (int i = 0; i < userIds.Count; i++)
            {
                var p = cmd.CreateParameter(); p.ParameterName = $"uid{i}"; p.Value = userIds[i]; cmd.Parameters.Add(p);
            }

            using var reader = await cmd.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var uid = reader.GetString(0);
                var username = reader.IsDBNull(1) ? uid : reader.GetString(1);
                var name = reader.IsDBNull(2) ? username : reader.GetString(2);
                result[uid] = new UserDetails(username, name);
            }
        }
        finally
        {
            await conn.CloseAsync();
        }
        return result;
    }

    /// <summary>
    /// Look up a userId from a username. Returns null if not found.
    /// </summary>
    private async Task<string?> GetUserIdByUsernameInternal(string username)
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
