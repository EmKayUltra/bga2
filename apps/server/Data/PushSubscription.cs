namespace Bga2.Server.Data;

/// <summary>
/// Web Push subscription for a user. Stores the VAPID endpoint and key material
/// needed to send push notifications to a specific browser/device.
/// One user can have multiple subscriptions (different browsers/devices).
/// </summary>
public class PushSubscription
{
    public Guid Id { get; set; }
    public string UserId { get; set; } = "";
    public string Endpoint { get; set; } = "";
    public string P256dh { get; set; } = "";    // Diffie-Hellman public key
    public string Auth { get; set; } = "";       // 16-byte auth secret (base64url)
    public DateTime CreatedAt { get; set; }
}
