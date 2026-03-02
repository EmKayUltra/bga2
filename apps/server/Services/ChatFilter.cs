namespace Bga2.Server.Services;

/// <summary>
/// Server-side profanity filter for chat messages.
/// Replaces blocked words with asterisks before publishing to AppSync.
/// Handles basic l33t-speak obfuscation (a→@, e→3, i→1, o→0, s→$/$5).
/// </summary>
public class ChatFilter
{
    // A curated set of common English profanity words.
    // Stored as lowercase normalized forms; comparison is case-insensitive.
    private static readonly HashSet<string> _blockedWords = new(StringComparer.OrdinalIgnoreCase)
    {
        "ass", "arse", "asshole", "assholes", "bastard", "bastards",
        "bitch", "bitches", "bitching", "bloody",
        "bollocks", "bullshit",
        "cock", "cocks", "cocksucker",
        "crap", "crappy",
        "cunt", "cunts",
        "damn", "dammit", "damned",
        "dick", "dicks", "dickhead", "dickheads",
        "douche", "douchebag",
        "fag", "faggot", "faggots",
        "fuck", "fucker", "fuckers", "fucking", "fucked", "fucks",
        "goddamn", "goddammit",
        "hell",
        "homo",
        "jackass",
        "jerk",
        "motherfucker", "motherfuckers", "motherfucking",
        "nigga", "nigger", "niggers",
        "penis", "piss", "pissed",
        "prick", "pricks",
        "pussy", "pussies",
        "retard", "retarded",
        "shit", "shits", "shitting", "shitty", "bullshit",
        "slut", "slutty",
        "twat", "twats",
        "whore", "whores",
        "wank", "wanker", "wankers",
    };

    /// <summary>
    /// Filter a chat message, replacing blocked words with asterisks.
    /// Returns the filtered message (may be identical to input if no blocked words found).
    /// </summary>
    public string Filter(string message)
    {
        if (string.IsNullOrWhiteSpace(message))
            return message;

        var words = message.Split(' ');
        for (int i = 0; i < words.Length; i++)
        {
            // Strip punctuation from word edges for matching, keep original for replacement
            var stripped = StripPunctuation(words[i]);
            var normalized = NormalizeLeetSpeak(stripped.ToLower());
            if (_blockedWords.Contains(normalized))
            {
                words[i] = new string('*', words[i].Length);
            }
        }
        return string.Join(' ', words);
    }

    /// <summary>
    /// Normalize common l33t-speak substitutions so filters are harder to bypass.
    /// e.g. "@ss" → "ass", "sh1t" → "shit"
    /// </summary>
    private static string NormalizeLeetSpeak(string word)
    {
        return word
            .Replace('@', 'a')
            .Replace('3', 'e')
            .Replace('1', 'i')
            .Replace('0', 'o')
            .Replace('$', 's')
            .Replace('5', 's');
    }

    /// <summary>
    /// Strip leading and trailing punctuation from a word for matching purposes.
    /// </summary>
    private static string StripPunctuation(string word)
    {
        return word.Trim('.', ',', '!', '?', ';', ':', '"', '\'', '(', ')', '[', ']', '-');
    }
}
