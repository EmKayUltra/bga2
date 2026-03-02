using Microsoft.EntityFrameworkCore;

namespace Bga2.Server.Data;

/// <summary>
/// EF Core database context for bga2.
/// Configured for PostgreSQL with JSONB game state and xmin optimistic locking.
/// </summary>
public class GameDbContext : DbContext
{
    public GameDbContext(DbContextOptions<GameDbContext> options) : base(options)
    {
    }

    // Phase 1/2 entities
    public DbSet<GameSession> GameSessions => Set<GameSession>();

    // Phase 3 entities
    public DbSet<GameTable> GameTables => Set<GameTable>();
    public DbSet<TablePlayer> TablePlayers => Set<TablePlayer>();
    public DbSet<Friendship> Friendships => Set<Friendship>();
    public DbSet<MatchResult> MatchResults => Set<MatchResult>();
    public DbSet<UserProfile> UserProfiles => Set<UserProfile>();
    public DbSet<PlayerReport> PlayerReports => Set<PlayerReport>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // ── GameSession ──────────────────────────────────────────────────────
        modelBuilder.Entity<GameSession>(entity =>
        {
            entity.HasKey(e => e.Id);

            // Store game state as JSONB — enables server-side JSON querying if needed
            entity.Property(e => e.State)
                .HasColumnType("jsonb")
                .HasDefaultValue("{}");

            entity.Property(e => e.GameId)
                .HasMaxLength(64)
                .IsRequired();

            // PlayedMoveIds: JSON array of client move UUIDs for idempotency deduplication.
            // Stored as jsonb for consistency with State column; defaults to empty array.
            entity.Property(e => e.PlayedMoveIds)
                .HasColumnType("jsonb")
                .HasDefaultValue("[]")
                .IsRequired();

            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("NOW()");

            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("NOW()");

            // xmin concurrency token — PostgreSQL auto-increments this on every UPDATE.
            // The [Timestamp] attribute on RowVersion property handles optimistic locking.
            // Npgsql maps uint [Timestamp] to PostgreSQL xmin system column automatically
            // when UseXminAsConcurrencyToken() is called (the [Timestamp] attribute alone
            // is not sufficient to map to xmin in Npgsql — we need the explicit call).
#pragma warning disable CS0618 // UseXminAsConcurrencyToken obsolete warning — required for xmin mapping
            entity.UseXminAsConcurrencyToken();
#pragma warning restore CS0618
        });

        // ── GameTable ────────────────────────────────────────────────────────
        modelBuilder.Entity<GameTable>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.Property(e => e.GameId)
                .HasMaxLength(64)
                .IsRequired();

            entity.Property(e => e.HostUserId)
                .HasMaxLength(64)
                .IsRequired();

            entity.Property(e => e.DisplayName)
                .HasMaxLength(128)
                .IsRequired();

            entity.Property(e => e.PasswordHash)
                .HasMaxLength(256);

            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("NOW()");

            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("NOW()");

            // Index on Status for efficient lobby listing queries
            entity.HasIndex(e => e.Status);
        });

        // ── TablePlayer ──────────────────────────────────────────────────────
        modelBuilder.Entity<TablePlayer>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.Property(e => e.UserId)
                .HasMaxLength(64)
                .IsRequired();

            entity.Property(e => e.DisplayName)
                .HasMaxLength(128)
                .IsRequired();

            entity.Property(e => e.JoinedAt)
                .HasDefaultValueSql("NOW()");

            // Unique: one seat per user per table
            entity.HasIndex(e => new { e.TableId, e.UserId }).IsUnique();

            // FK to GameTable
            entity.HasOne<GameTable>()
                .WithMany()
                .HasForeignKey(e => e.TableId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ── Friendship ───────────────────────────────────────────────────────
        modelBuilder.Entity<Friendship>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.Property(e => e.RequesterId)
                .HasMaxLength(64)
                .IsRequired();

            entity.Property(e => e.AddresseeId)
                .HasMaxLength(64)
                .IsRequired();

            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("NOW()");

            // Unique: only one friendship record per (requester, addressee) pair
            entity.HasIndex(e => new { e.RequesterId, e.AddresseeId }).IsUnique();
        });

        // ── UserProfile ──────────────────────────────────────────────────────
        modelBuilder.Entity<UserProfile>(entity =>
        {
            // UserId is PK (references Better Auth user.id)
            entity.HasKey(e => e.UserId);

            entity.Property(e => e.UserId)
                .HasMaxLength(64)
                .IsRequired();

            entity.Property(e => e.Avatar)
                .HasMaxLength(64)
                .HasDefaultValue("default")
                .IsRequired();

            entity.Property(e => e.IsPublic)
                .HasDefaultValue(true);

            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("NOW()");

            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("NOW()");
        });

        // ── MatchResult ──────────────────────────────────────────────────────
        modelBuilder.Entity<MatchResult>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.Property(e => e.UserId)
                .HasMaxLength(64)
                .IsRequired();

            entity.Property(e => e.GameId)
                .HasMaxLength(64)
                .IsRequired();

            entity.Property(e => e.CompletedAt)
                .HasDefaultValueSql("NOW()");

            // Index on UserId for per-player match history queries
            entity.HasIndex(e => e.UserId);

            // Index on SessionId to look up all results for a session
            entity.HasIndex(e => e.SessionId);

            // FK to GameSession
            entity.HasOne<GameSession>()
                .WithMany()
                .HasForeignKey(e => e.SessionId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        // ── PlayerReport ─────────────────────────────────────────────────────
        modelBuilder.Entity<PlayerReport>(entity =>
        {
            entity.HasKey(e => e.Id);

            entity.Property(e => e.ReporterUserId)
                .HasMaxLength(64)
                .IsRequired();

            entity.Property(e => e.ReportedUserId)
                .HasMaxLength(64)
                .IsRequired();

            entity.Property(e => e.ChannelId)
                .HasMaxLength(128);

            entity.Property(e => e.MessageText)
                .HasMaxLength(1024);

            entity.Property(e => e.Reason)
                .HasMaxLength(512);

            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("NOW()");

            // Index on ReportedUserId for moderation review queries
            entity.HasIndex(e => e.ReportedUserId);

            // Index on ReporterUserId + CreatedAt for rate limiting
            entity.HasIndex(e => new { e.ReporterUserId, e.CreatedAt });
        });
    }
}
