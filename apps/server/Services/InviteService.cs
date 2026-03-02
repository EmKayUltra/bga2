using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Bga2.Server.Services;

// ─── Response models ──────────────────────────────────────────────────────────

/// <summary>Result of validating an invite token.</summary>
public record InviteValidation(bool Valid, Guid? TableId = null, string? Error = null);

// ─── Service ──────────────────────────────────────────────────────────────────

/// <summary>
/// Generates and validates HMAC-signed invite tokens for game tables.
///
/// Token format (base64url encoded): {tableId}:{expiresAt}:{hmacSignature}
/// - tableId: Guid string
/// - expiresAt: ISO 8601 UTC datetime
/// - hmacSignature: HMACSHA256 over "{tableId}:{expiresAt}" using InviteSecret
///
/// Tokens expire 24 hours after creation.
/// Secret defaults to "bga2-dev-invite-secret" if not configured.
/// </summary>
public class InviteService
{
    private readonly string _secret;
    private readonly ILogger<InviteService> _logger;

    private static readonly TimeSpan TokenExpiry = TimeSpan.FromHours(24);

    public InviteService(IConfiguration configuration, ILogger<InviteService> logger)
    {
        _secret = configuration["InviteSecret"] ?? "bga2-dev-invite-secret";
        _logger = logger;
    }

    /// <summary>
    /// Create a signed invite token for the given table.
    /// Returns a base64url-encoded token string valid for 24 hours.
    /// </summary>
    public string CreateInviteToken(Guid tableId, string hostUserId)
    {
        var expiresAt = DateTime.UtcNow.Add(TokenExpiry).ToString("O"); // ISO 8601
        var payload = $"{tableId}:{expiresAt}";
        var signature = ComputeHmac(payload);

        // Combine: tableId:expiresAt:signature
        var raw = $"{payload}:{signature}";
        return Base64UrlEncode(raw);
    }

    /// <summary>
    /// Validate an invite token. Returns success with tableId or failure with error message.
    /// </summary>
    public InviteValidation ValidateInviteToken(string token)
    {
        string raw;
        try
        {
            raw = Base64UrlDecode(token);
        }
        catch
        {
            return new InviteValidation(false, Error: "Invalid token format");
        }

        // Split into exactly 3 parts: tableId, expiresAt, signature
        // Note: expiresAt (ISO 8601) contains colons, so we split from the right
        var lastColon = raw.LastIndexOf(':');
        if (lastColon < 0)
            return new InviteValidation(false, Error: "Invalid token format");

        var signature = raw[(lastColon + 1)..];
        var payload = raw[..lastColon];

        // Verify HMAC signature
        var expectedSignature = ComputeHmac(payload);
        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(signature),
                Encoding.UTF8.GetBytes(expectedSignature)))
        {
            return new InviteValidation(false, Error: "Invalid token signature");
        }

        // payload = tableId:expiresAt
        var firstColon = payload.IndexOf(':');
        if (firstColon < 0)
            return new InviteValidation(false, Error: "Invalid token payload");

        var tableIdStr = payload[..firstColon];
        var expiresAtStr = payload[(firstColon + 1)..];

        if (!Guid.TryParse(tableIdStr, out var tableId))
            return new InviteValidation(false, Error: "Invalid table ID in token");

        if (!DateTime.TryParse(expiresAtStr, null, System.Globalization.DateTimeStyles.RoundtripKind, out var expiresAt))
            return new InviteValidation(false, Error: "Invalid expiry in token");

        if (DateTime.UtcNow > expiresAt)
            return new InviteValidation(false, Error: "Invite link has expired");

        return new InviteValidation(true, TableId: tableId);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private string ComputeHmac(string payload)
    {
        var keyBytes = Encoding.UTF8.GetBytes(_secret);
        var payloadBytes = Encoding.UTF8.GetBytes(payload);
        using var hmac = new HMACSHA256(keyBytes);
        var hash = hmac.ComputeHash(payloadBytes);
        return Convert.ToBase64String(hash)
            .Replace('+', '-').Replace('/', '_').TrimEnd('='); // base64url
    }

    private static string Base64UrlEncode(string input)
    {
        var bytes = Encoding.UTF8.GetBytes(input);
        return Convert.ToBase64String(bytes)
            .Replace('+', '-').Replace('/', '_').TrimEnd('=');
    }

    private static string Base64UrlDecode(string input)
    {
        // Pad to multiple of 4
        var padded = input.Replace('-', '+').Replace('_', '/');
        switch (padded.Length % 4)
        {
            case 2: padded += "=="; break;
            case 3: padded += "="; break;
        }
        var bytes = Convert.FromBase64String(padded);
        return Encoding.UTF8.GetString(bytes);
    }
}
