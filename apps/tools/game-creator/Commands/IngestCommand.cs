using System.CommandLine;
using Bga2.GameCreator.Pipeline;

namespace Bga2.GameCreator.Commands;

public static class IngestCommand
{
    public static Command Create()
    {
        var gameIdArg = new Argument<string>("game-id", "Unique game identifier (e.g., 'hive')");
        var rulebookArg = new Argument<string>("rulebook", "Path to rulebook file (PDF, text, or image)");
        var outputOpt = new Option<string>("--output", () => ".", "Output directory for game-spec.json and review report");

        var cmd = new Command("ingest", "Ingest a rulebook and generate game-spec.json via LLM")
        {
            gameIdArg, rulebookArg, outputOpt
        };

        cmd.SetHandler(async (gameId, rulebookPath, outputDir) =>
        {
            Console.WriteLine($"Ingesting rulebook: {rulebookPath} for game: {gameId}");

            var ingestor = new RulebookIngestor();
            var specGenerator = new SpecGenerator();
            var reviewer = new ReviewReporter();

            // Load rulebook
            var (mediaType, content, isText) = ingestor.Load(rulebookPath);
            if (isText)
                Console.WriteLine($"Loaded {mediaType} ({content.Length} chars)");
            else
                Console.WriteLine($"Loaded {mediaType} ({Convert.FromBase64String(content).Length} bytes)");

            // Generate spec via LLM
            Console.WriteLine("Generating game spec via Claude...");
            var specJson = await specGenerator.GenerateSpec(gameId, mediaType, content, isText);

            // Write spec
            var specPath = Path.Combine(outputDir, "game-spec.json");
            Directory.CreateDirectory(outputDir);
            File.WriteAllText(specPath, specJson);
            Console.WriteLine($"Wrote: {specPath}");

            // Generate review report
            var reportMd = reviewer.GenerateReport(specJson, gameId);
            var reportPath = Path.Combine(outputDir, "REVIEW.md");
            File.WriteAllText(reportPath, reportMd);
            Console.WriteLine($"Wrote: {reportPath}");

            Console.WriteLine("\nNext steps:");
            Console.WriteLine($"  1. Review {reportPath} — check off items, resolve [AMBIGUOUS] flags");
            Console.WriteLine($"  2. Edit {specPath} if corrections are needed");
            Console.WriteLine($"  3. Run: dotnet run -- generate {gameId} {specPath} --output libs/games/{gameId}");
        }, gameIdArg, rulebookArg, outputOpt);

        return cmd;
    }
}
