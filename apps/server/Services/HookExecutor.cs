using System.Text.Json;
using System.Text.RegularExpressions;
using Bga2.Server.Models;
using Jint;
using Jint.Native;
using Microsoft.Extensions.Logging;

namespace Bga2.Server.Services;

/// <summary>
/// Executes TypeScript game hook functions (getValidMoves, onMove) via Jint.
///
/// Phase 1 approach: strip TypeScript type annotations from hooks.ts to produce
/// valid JavaScript, then execute in Jint. Phase 2 will use a proper tsc compile step.
///
/// Jint runs in-process — no Node.js subprocess, no network calls.
/// A 5-second timeout guards against infinite loops in hook code.
/// </summary>
public class HookExecutor
{
    private readonly ILogger<HookExecutor> _logger;
    private static readonly TimeSpan JintTimeout = TimeSpan.FromSeconds(5);

    // Base JavaScript shims that every hook execution environment needs
    private const string JsShims = """
        // Minimal console shim for Jint (hooks may use console.log for debugging)
        var console = {
            log: function() {},
            warn: function() {},
            error: function() {}
        };

        // JSON is available natively in Jint
        """;

    public HookExecutor(ILogger<HookExecutor> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Returns all legal moves for the current player by executing getValidMoves(ctx).
    /// </summary>
    /// <param name="hooksSource">JavaScript source (TypeScript type annotations already stripped)</param>
    /// <param name="gameStateJson">Current game state as JSON string</param>
    /// <param name="currentPlayer">Current player id</param>
    /// <param name="round">Current round number</param>
    /// <returns>List of valid moves, or empty list if hook returns none or errors</returns>
    public List<ValidMove> GetValidMoves(string hooksSource, string gameStateJson, string currentPlayer, int round)
    {
        try
        {
            var engine = CreateEngine();

            // Build the hook context matching HookContext from shared-types
            var ctx = BuildHookContext(gameStateJson, currentPlayer, round);

            engine.Execute(JsShims);
            engine.Execute(hooksSource);

            // Call getValidMoves(ctx)
            var result = engine.Invoke("getValidMoves", ctx);

            return ParseValidMoves(result);
        }
        catch (TimeoutException)
        {
            _logger.LogWarning("getValidMoves execution timed out after {Timeout}s", JintTimeout.TotalSeconds);
            return [];
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "getValidMoves hook execution failed");
            return [];
        }
    }

    /// <summary>
    /// Applies a player's move to the game state by executing onMove(ctx, move).
    /// Returns the updated game state JSON.
    /// </summary>
    /// <param name="hooksSource">JavaScript source</param>
    /// <param name="gameStateJson">Current game state as JSON string</param>
    /// <param name="move">The move to apply</param>
    /// <param name="currentPlayer">Current player id</param>
    /// <param name="round">Current round number</param>
    /// <returns>Updated game state JSON string, or original state if hook errors</returns>
    public (string NewStateJson, List<string> Errors) OnMove(
        string hooksSource,
        string gameStateJson,
        MoveRequest move,
        string currentPlayer,
        int round)
    {
        try
        {
            var engine = CreateEngine();

            var ctx = BuildHookContext(gameStateJson, currentPlayer, round);
            var moveJs = BuildMoveObject(move);

            engine.Execute(JsShims);
            engine.Execute(hooksSource);

            // onMove mutates ctx.state in place
            engine.Invoke("onMove", ctx, moveJs);

            // Extract updated state from ctx.state
            var stateValue = engine.Evaluate("JSON.stringify(ctx.state)");
            var newStateJson = stateValue.IsString() ? stateValue.AsString() : gameStateJson;

            return (newStateJson, []);
        }
        catch (TimeoutException)
        {
            var msg = $"onMove execution timed out after {JintTimeout.TotalSeconds}s";
            _logger.LogWarning("{Message}", msg);
            return (gameStateJson, [msg]);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "onMove hook execution failed");
            return (gameStateJson, [$"Hook execution error: {ex.Message}"]);
        }
    }

    /// <summary>
    /// Loads the hooks source for a game, stripping TypeScript type annotations
    /// so Jint can execute it as plain JavaScript.
    ///
    /// Phase 1: loads from a known file path in the monorepo.
    /// Phase 2: will use a proper tsc compile step and load .js output.
    /// </summary>
    public string LoadHooks(string gameId, string? monorepoRoot = null)
    {
        var root = monorepoRoot ?? FindMonorepoRoot();
        var hooksPath = Path.Combine(root, "libs", "games", gameId, "src", "hooks.ts");

        if (!File.Exists(hooksPath))
        {
            _logger.LogWarning("Hooks file not found at {Path}, using empty hooks", hooksPath);
            return GetEmptyHooks();
        }

        var tsSource = File.ReadAllText(hooksPath);
        return StripTypeScriptAnnotations(tsSource);
    }

    /// <summary>
    /// Strips TypeScript-specific syntax from a .ts file to produce valid JavaScript.
    ///
    /// Handles the Phase 1 Azul hooks stubs which use:
    ///   - import type { ... } statements
    ///   - : TypeAnnotation on function parameters
    ///   - : ReturnType on functions
    ///   - export const azulHooks: HookFunctions = { ... }
    ///
    /// This is intentionally minimal — sufficient for stub hooks, not a general TS parser.
    /// Phase 2 will replace this with a proper tsc/esbuild compile step.
    /// </summary>
    internal static string StripTypeScriptAnnotations(string tsSource)
    {
        var js = tsSource;

        // Remove import type {...} from '...' lines
        js = Regex.Replace(js, @"import type \{[^}]*\} from '[^']*';\r?\n?", "", RegexOptions.Multiline);

        // Remove import {...} from '...' lines (regular imports also unusable in Jint)
        js = Regex.Replace(js, @"import \{[^}]*\} from '[^']*';\r?\n?", "", RegexOptions.Multiline);

        // Remove export type { ... } lines
        js = Regex.Replace(js, @"export type \{[^}]*\};\r?\n?", "", RegexOptions.Multiline);

        // Remove interface declarations (multi-line) — interface Foo { ... }
        js = Regex.Replace(js, @"(export\s+)?interface\s+\w+[^{]*\{[^}]*\}", "", RegexOptions.Singleline);

        // Remove type alias declarations — type Foo = ...;
        js = Regex.Replace(js, @"(export\s+)?type\s+\w+\s*=\s*[^;]+;", "", RegexOptions.Multiline);

        // Remove : TypeAnnotation from function parameters — (param: Type) -> (param)
        // Also handles optional params: (param?: Type) -> (param)
        // Also handles default values: (param: Type = default) -> (param = default)
        // Pattern: word char(s) followed by ?: and then a type annotation (up to , or ) or =)
        js = Regex.Replace(js, @"(\w+)\??\s*:\s*[A-Za-z_$][A-Za-z0-9_$<>\[\]|&\s,\.']*(?=[,)=])", "$1");

        // Remove return type annotations from functions — ): Type { -> ) {
        js = Regex.Replace(js, @"\)\s*:\s*[A-Za-z_$][A-Za-z0-9_$<>\[\]|&\s,\.]*\s*\{", ") {");

        // Remove "export const name: Type = " -> "var name = " (for azulHooks: HookFunctions)
        // Also handles "export const name = "
        js = Regex.Replace(js, @"export const (\w+)\s*(?::\s*[A-Za-z_$][A-Za-z0-9_$<>\[\]|&\s,\.]*\s*)?=\s*", "var $1 = ");

        // Remove remaining "export function" -> "function"
        js = Regex.Replace(js, @"export function", "function");

        // Remove "export default" -> ""
        js = Regex.Replace(js, @"export default\s+", "");

        // Remove underscore-prefixed params that start with _ (TypeScript unused params)
        // Leave them as-is — they're valid JS too, just with _ prefix

        return js;
    }

    private Engine CreateEngine()
    {
        return new Engine(opts =>
        {
            opts.TimeoutInterval(JintTimeout);
            opts.LimitMemory(50 * 1024 * 1024); // 50MB memory limit per execution
        });
    }

    private JsValue BuildHookContext(string gameStateJson, string currentPlayer, int round)
    {
        // We expose ctx as a global so onMove can mutate ctx.state
        // and we can read it back after execution
        var contextSetup = $$"""
            var ctx = {
                state: JSON.parse('{{EscapeForJsString(gameStateJson)}}'),
                currentPlayer: '{{EscapeForJsString(currentPlayer)}}',
                round: {{round}},
                players: []
            };
            """;

        var engine = CreateEngine();
        engine.Execute(contextSetup);

        return engine.GetValue("ctx");
    }

    private JsValue BuildMoveObject(MoveRequest move)
    {
        var moveJson = JsonSerializer.Serialize(move, new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        });

        var engine = CreateEngine();
        engine.Execute($"var move = JSON.parse('{EscapeForJsString(moveJson)}');");
        return engine.GetValue("move");
    }

    private List<ValidMove> ParseValidMoves(JsValue result)
    {
        if (result.IsNull() || result.IsUndefined())
            return [];

        try
        {
            // Serialize the Jint result back to JSON, then deserialize as C# objects
            var json = result.ToString();
            if (string.IsNullOrEmpty(json) || json == "undefined")
                return [];

            var moves = JsonSerializer.Deserialize<List<Dictionary<string, JsonElement>>>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (moves == null) return [];

            return moves.Select(m => new ValidMove(
                Action: m.TryGetValue("action", out var a) ? a.GetString() ?? "" : "",
                Source: m.TryGetValue("source", out var s) ? s.GetString() : null,
                Target: m.TryGetValue("target", out var t) ? t.GetString() : null,
                PieceId: m.TryGetValue("pieceId", out var p) ? p.GetString() : null,
                Description: m.TryGetValue("description", out var d) ? d.GetString() : null
            )).ToList();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to parse getValidMoves result");
            return [];
        }
    }

    private static string EscapeForJsString(string value)
    {
        // Escape for embedding in a JS single-quoted string
        return value
            .Replace("\\", "\\\\")
            .Replace("'", "\\'")
            .Replace("\n", "\\n")
            .Replace("\r", "\\r");
    }

    private static string GetEmptyHooks()
    {
        return """
            function getValidMoves(ctx) { return []; }
            function onMove(ctx, move) {}
            function onRoundEnd(ctx) {}
            """;
    }

    /// <summary>
    /// Walk up directory tree from current directory to find the NX monorepo root
    /// (identified by presence of nx.json).
    /// </summary>
    private static string FindMonorepoRoot()
    {
        var dir = Directory.GetCurrentDirectory();
        while (!string.IsNullOrEmpty(dir))
        {
            if (File.Exists(Path.Combine(dir, "nx.json")))
                return dir;
            var parent = Directory.GetParent(dir)?.FullName;
            if (parent == dir || parent == null) break;
            dir = parent;
        }
        // Fallback: assume we're run from the apps/server directory
        return Path.Combine(Directory.GetCurrentDirectory(), "..", "..");
    }
}
