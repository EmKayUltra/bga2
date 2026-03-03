using System.CommandLine;
using Bga2.GameCreator.Deployment;

namespace Bga2.GameCreator.Commands;

public static class DeployCommand
{
    public static Command Create()
    {
        var gameIdArg = new Argument<string>("game-id", "Game identifier (e.g., 'hive')");
        var gameDirArg = new Argument<string>("game-dir", "Path to the game directory (e.g., 'libs/games/hive')");
        var versionOpt = new Option<string>("--version", () => "1.0.0", "Game version for the bundle");
        var bucketOpt = new Option<string?>("--bucket", () => null, "S3 bucket name (skip upload if not specified)");
        var regionOpt = new Option<string>("--region", () => "us-east-1", "AWS region for S3");

        var cmd = new Command("deploy", "Package and deploy a game bundle to S3")
        {
            gameIdArg, gameDirArg, versionOpt, bucketOpt, regionOpt
        };

        cmd.SetHandler(async (gameId, gameDir, version, bucket, region) =>
        {
            Console.WriteLine($"Deploying game: {gameId} v{version} from {gameDir}");

            var packager = new S3Packager();
            var (zipPath, warnings) = await packager.PackageAndUpload(gameDir, gameId, version, bucket, region);

            Console.WriteLine($"\nDone! Zip: {zipPath}");
            if (warnings.Count > 0)
            {
                Console.WriteLine($"\n{warnings.Count} warning(s):");
                foreach (var w in warnings)
                    Console.WriteLine($"  - {w}");
            }
        }, gameIdArg, gameDirArg, versionOpt, bucketOpt, regionOpt);

        return cmd;
    }
}
