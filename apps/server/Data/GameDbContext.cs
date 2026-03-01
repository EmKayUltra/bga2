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

    public DbSet<GameSession> GameSessions => Set<GameSession>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
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
    }
}
