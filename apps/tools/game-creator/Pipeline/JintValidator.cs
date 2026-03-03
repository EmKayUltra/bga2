using Jint;

namespace Bga2.GameCreator.Pipeline;

/// <summary>
/// Validates that generated hooks.ts code can be parsed and executed by Jint.
/// Performs both static checks (banned patterns) and a runtime parse test.
/// </summary>
public class JintValidator
{
    /// <summary>
    /// Returns a list of validation errors. Empty list = valid.
    /// </summary>
    public List<string> Validate(string hooksSource)
    {
        var errors = new List<string>();

        // Static checks for banned patterns
        if (hooksSource.Contains("import "))
            errors.Add("Contains 'import' statement — Jint does not support ES modules");
        if (hooksSource.Contains("export "))
            errors.Add("Contains 'export' statement — Jint does not support ES modules");
        if (hooksSource.Contains("async "))
            errors.Add("Contains 'async' keyword — Jint has limited async support");
        if (hooksSource.Contains("await "))
            errors.Add("Contains 'await' keyword — Jint has limited async support");
        if (hooksSource.Contains("require("))
            errors.Add("Contains 'require()' — Jint does not support CommonJS modules");

        // Check that required functions exist
        if (!hooksSource.Contains("function getValidMoves"))
            errors.Add("Missing function getValidMoves(ctx)");
        if (!hooksSource.Contains("function onMove"))
            errors.Add("Missing function onMove(ctx, move)");
        if (!hooksSource.Contains("function onRoundEnd"))
            errors.Add("Missing function onRoundEnd(ctx)");

        // Runtime parse test — try to execute in Jint
        try
        {
            var engine = new Engine(opts =>
            {
                opts.TimeoutInterval(TimeSpan.FromSeconds(5));
                opts.LimitMemory(50 * 1024 * 1024);
            });

            // Minimal shims
            engine.Execute("""
                var console = { log: function(){}, warn: function(){}, error: function(){} };
            """);

            engine.Execute(hooksSource);

            // Verify functions are callable
            var getValidMoves = engine.GetValue("getValidMoves");
            if (getValidMoves.IsUndefined())
                errors.Add("getValidMoves is not defined after execution");

            var onMove = engine.GetValue("onMove");
            if (onMove.IsUndefined())
                errors.Add("onMove is not defined after execution");

            var onRoundEnd = engine.GetValue("onRoundEnd");
            if (onRoundEnd.IsUndefined())
                errors.Add("onRoundEnd is not defined after execution");
        }
        catch (Exception ex)
        {
            errors.Add($"Jint parse/execution error: {ex.Message}");
        }

        return errors;
    }
}
