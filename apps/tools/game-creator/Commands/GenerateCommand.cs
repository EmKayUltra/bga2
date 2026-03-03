using System.CommandLine;
using Bga2.GameCreator.Pipeline;

namespace Bga2.GameCreator.Commands;

public static class GenerateCommand
{
    public static Command Create()
    {
        var gameIdArg = new Argument<string>("game-id", "Unique game identifier (e.g., 'hive')");
        var specArg = new Argument<string>("spec-path", "Path to the approved game-spec.json");
        var outputOpt = new Option<string>("--output", () => ".", "Output directory for game.json and hooks.ts");

        var cmd = new Command("generate", "Generate game.json + hooks.ts from an approved game-spec.json via LLM")
        {
            gameIdArg, specArg, outputOpt
        };

        cmd.SetHandler(async (gameId, specPath, outputDir) =>
        {
            Console.WriteLine($"Generating game package for: {gameId}");

            var specJson = File.ReadAllText(specPath);
            var codeGen = new CodeGenerator();
            var jintValidator = new JintValidator();

            // Generate game.json + hooks.ts via LLM
            Console.WriteLine("Generating game package via Claude...");
            var (gameJson, hooksTs) = await codeGen.Generate(gameId, specJson);

            // Validate hooks with Jint
            Console.WriteLine("Validating hooks.ts with Jint...");
            var errors = jintValidator.Validate(hooksTs);
            if (errors.Count > 0)
            {
                Console.WriteLine("WARNING: Jint validation found issues:");
                foreach (var error in errors)
                    Console.WriteLine($"  - {error}");
                Console.WriteLine("The files will still be written. Fix the issues manually or re-run.");
            }
            else
            {
                Console.WriteLine("Jint validation passed!");
            }

            // Write outputs
            Directory.CreateDirectory(outputDir);
            var srcDir = Path.Combine(outputDir, "src");
            Directory.CreateDirectory(srcDir);

            File.WriteAllText(Path.Combine(outputDir, "game.json"), gameJson);
            Console.WriteLine($"Wrote: {Path.Combine(outputDir, "game.json")}");

            File.WriteAllText(Path.Combine(srcDir, "hooks.ts"), hooksTs);
            Console.WriteLine($"Wrote: {Path.Combine(srcDir, "hooks.ts")}");

            Console.WriteLine($"\nGame package written to: {outputDir}");
            Console.WriteLine("Next steps:");
            Console.WriteLine("  1. Open the test harness: http://localhost:5173/dev/harness");
            Console.WriteLine($"  2. Select game: {gameId}");
            Console.WriteLine("  3. Play through the game to verify rules");
        }, gameIdArg, specArg, outputOpt);

        return cmd;
    }
}
