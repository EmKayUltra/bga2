using System.IO.Compression;
using Amazon.S3;
using Amazon.S3.Transfer;
using Bga2.GameCreator.Pipeline;

namespace Bga2.GameCreator.Deployment;

/// <summary>
/// Packages a game directory into a zip bundle and uploads to S3.
/// Validates the game package before packaging.
/// </summary>
public class S3Packager
{
    /// <summary>
    /// Validates, packages, and optionally uploads a game bundle.
    /// </summary>
    /// <param name="gameDir">Path to the game directory (e.g., libs/games/hive/)</param>
    /// <param name="gameId">Game identifier</param>
    /// <param name="version">Version string (e.g., "1.0.0")</param>
    /// <param name="bucketName">S3 bucket name (null = skip upload, just create zip)</param>
    /// <param name="region">AWS region (default: us-east-1)</param>
    /// <returns>Path to the created zip file and any validation warnings</returns>
    public async Task<(string ZipPath, List<string> Warnings)> PackageAndUpload(
        string gameDir,
        string gameId,
        string version,
        string? bucketName = null,
        string region = "us-east-1")
    {
        var warnings = new List<string>();

        // === Validate ===
        var gameJsonPath = Path.Combine(gameDir, "game.json");
        if (!File.Exists(gameJsonPath))
            throw new FileNotFoundException($"game.json not found in {gameDir}");

        var hooksPath = Path.Combine(gameDir, "src", "hooks.ts");
        if (!File.Exists(hooksPath))
            throw new FileNotFoundException($"src/hooks.ts not found in {gameDir}");

        // Jint validation
        var validator = new JintValidator();
        var hooksSource = File.ReadAllText(hooksPath);

        // Strip TypeScript annotations for Jint validation (same as HookExecutor)
        var strippedSource = StripBasicTypeScript(hooksSource);
        var errors = validator.Validate(strippedSource);
        if (errors.Count > 0)
        {
            warnings.AddRange(errors.Select(e => $"Jint validation: {e}"));
            Console.WriteLine("WARNING: Jint validation found issues (packaging anyway):");
            foreach (var error in errors)
                Console.WriteLine($"  - {error}");
        }

        // === Package ===
        var zipFileName = $"{gameId}-{version}.zip";
        var zipPath = Path.Combine(Path.GetTempPath(), zipFileName);

        if (File.Exists(zipPath))
            File.Delete(zipPath);

        using (var zip = ZipFile.Open(zipPath, ZipArchiveMode.Create))
        {
            // Add game.json
            zip.CreateEntryFromFile(gameJsonPath, "game.json");

            // Add all files in src/
            var srcDir = Path.Combine(gameDir, "src");
            if (Directory.Exists(srcDir))
            {
                foreach (var file in Directory.GetFiles(srcDir, "*", SearchOption.AllDirectories))
                {
                    var relativePath = Path.GetRelativePath(gameDir, file);
                    zip.CreateEntryFromFile(file, relativePath);
                }
            }
        }

        Console.WriteLine($"Created zip: {zipPath} ({new FileInfo(zipPath).Length:N0} bytes)");

        // === Upload to S3 (if bucket specified) ===
        if (!string.IsNullOrEmpty(bucketName))
        {
            var s3Key = $"games/{gameId}/{version}.zip";
            Console.WriteLine($"Uploading to s3://{bucketName}/{s3Key}...");

            try
            {
                var config = new AmazonS3Config { RegionEndpoint = Amazon.RegionEndpoint.GetBySystemName(region) };
                using var s3Client = new AmazonS3Client(config);
                var transferUtility = new TransferUtility(s3Client);

                await transferUtility.UploadAsync(new TransferUtilityUploadRequest
                {
                    BucketName = bucketName,
                    Key = s3Key,
                    FilePath = zipPath,
                    ContentType = "application/zip"
                });

                Console.WriteLine($"Uploaded to s3://{bucketName}/{s3Key}");
            }
            catch (Exception ex)
            {
                warnings.Add($"S3 upload failed: {ex.Message}");
                Console.WriteLine($"WARNING: S3 upload failed: {ex.Message}");
                Console.WriteLine("The zip file was created successfully. You can upload it manually.");
            }
        }
        else
        {
            Console.WriteLine("No S3 bucket specified — skipping upload. Zip file is ready for manual upload.");
        }

        return (zipPath, warnings);
    }

    /// <summary>
    /// Basic TypeScript stripping for Jint validation.
    /// Removes import statements, type aliases, and interface declarations,
    /// and replaces export keywords for compatibility.
    /// </summary>
    private static string StripBasicTypeScript(string tsSource)
    {
        var lines = tsSource.Split('\n');
        var result = new List<string>();
        var inInterfaceBlock = false;
        var braceDepth = 0;

        foreach (var line in lines)
        {
            var trimmed = line.Trim();

            // Skip import lines
            if (trimmed.StartsWith("import ")) continue;

            // Skip type alias lines
            if (trimmed.StartsWith("type ") && trimmed.Contains("=")) continue;

            // Handle interface block start
            if ((trimmed.StartsWith("interface ") || trimmed.StartsWith("export interface ")) && trimmed.EndsWith("{"))
            {
                inInterfaceBlock = true;
                braceDepth = 1;
                continue;
            }

            // Track brace depth when inside interface block
            if (inInterfaceBlock)
            {
                foreach (var ch in line)
                {
                    if (ch == '{') braceDepth++;
                    else if (ch == '}') braceDepth--;
                }
                if (braceDepth <= 0)
                    inInterfaceBlock = false;
                continue;
            }

            // Replace export function with function
            var processed = line.Replace("export function ", "function ");

            // Replace export const with var
            processed = processed.Replace("export const ", "var ");

            result.Add(processed);
        }

        return string.Join("\n", result);
    }
}
