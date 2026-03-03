using System.IO.Compression;
using System.Text.RegularExpressions;
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

        // Strip TypeScript annotations for Jint validation (mirrors HookExecutor approach)
        var strippedSource = StripTypeScriptAnnotations(hooksSource);
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
    /// Strips TypeScript-specific syntax from a .ts file to produce valid JavaScript.
    /// Mirrors the approach in HookExecutor.StripTypeScriptAnnotations on the server.
    /// Handles: import statements, interface declarations, type aliases, return type
    /// annotations, parameter type annotations, export keywords, type assertions, and
    /// generic type parameters.
    /// </summary>
    internal static string StripTypeScriptAnnotations(string tsSource)
    {
        var js = tsSource;

        // 1. Remove "import type { ... } from '...';" lines
        js = Regex.Replace(js, @"import type \{[^}]*\} from '[^']*';\r?\n?", "", RegexOptions.Multiline);

        // 2. Remove "import { ... } from '...';" lines (regular imports unusable in Jint)
        js = Regex.Replace(js, @"import \{[^}]*\} from '[^']*';\r?\n?", "", RegexOptions.Multiline);

        // 3. Remove "import '...';" bare imports
        js = Regex.Replace(js, @"import '[^']*';\r?\n?", "", RegexOptions.Multiline);

        // 4. Remove "export type { ... };" lines
        js = Regex.Replace(js, @"export type \{[^}]*\};\r?\n?", "", RegexOptions.Multiline);

        // 5. Remove interface declarations (multi-line) — interface Foo { ... }
        //    Iteratively remove to handle nesting
        for (var i = 0; i < 5; i++)
            js = Regex.Replace(js, @"(export\s+)?interface\s+\w+[^{]*\{[^{}]*\}", "", RegexOptions.Singleline);

        // 6. Remove type alias declarations — type Foo = ...;
        js = Regex.Replace(js, @"(export\s+)?type\s+\w+\s*=\s*[^;]+;", "", RegexOptions.Multiline);

        // 7. Remove generic type parameters from function declarations: function foo<T>( -> function foo(
        js = Regex.Replace(js, @"((?:function|export function)\s+\w+)\s*<[^>]*>(?=\s*\()", "$1");

        // 8. Remove complex return type annotations that include generics/object types
        //    Heuristic: ): ReturnType { -> ) {
        //    Also handles inline object types like ): { q: number; r: number } {
        js = Regex.Replace(js, @"\)[ \t]*:[ \t]*(?:void|boolean|number|string|never|null|undefined|\{[^{}]*\}|[A-Za-z_$][A-Za-z0-9_$<>;\[\]|& ,.\{\}':]*)[ \t]*\{",
            ") {");

        // 9. Remove "as unknown as Type" type assertions
        js = Regex.Replace(js, @"\s+as\s+unknown\s+as\s+[A-Za-z_$][A-Za-z0-9_$]*", "");

        // 10. Remove "as Type<...>" assertions (with generics)
        js = Regex.Replace(js, @"\s+as\s+[A-Za-z_$][A-Za-z0-9_$]*\s*<[A-Za-z0-9_$\s,\[\]|&\.'{}:]*>", "");

        // 10b. Remove "as { inline: object }" type assertions
        js = Regex.Replace(js, @"\s+as\s+\{[^{}]*\}(?=[;\)\]\},\s])", "");

        // 11. Remove plain "as Type" and "as Type[]" assertions
        js = Regex.Replace(js, @"\s+as\s+[A-Za-z_$][A-Za-z0-9_$]*(?:\[\])*(?=[;\)\]\},\s\[])", "");

        // 12. Remove variable type annotations: const x: Type = / let x: Type = / var x: Type =
        //     Also handles index signature types like { [key: string]: boolean }
        js = Regex.Replace(js, @"((?:const|let|var)[ \t]+\w+)[ \t]*:[ \t]*(?:\{[^{}]*\}|[A-Za-z_$][A-Za-z0-9_$<>;\[\]|&:{ },.\\']*)[ \t]*(?==)", "$1");

        // 13. Remove generic type arguments from new expressions: new Set<string>() -> new Set()
        //     And from Array.from<X>( -> Array.from(
        for (var i = 0; i < 4; i++)
            js = Regex.Replace(js, @"([A-Za-z_$][A-Za-z0-9_$.]*)\s*<[A-Za-z0-9_$\s,\[\]|&\.'{}:]*>(?=[()\[\]{}\s;,])", "$1");

        // 14a. Remove inline object type param annotations: (d: { q: number; r: number }) -> (d)
        //      Also handles index signature: (keys: { [key: string]: boolean }) -> (keys)
        //      Only strip when the object content looks like a TS type:
        //      - Contains ';' (semicolon-delimited type members): { q: number; r: number }
        //      - OR starts with '[' (index signature): { [key: string]: boolean }
        //      NOT regular object literals with comma separators like { q: 1, r: 2 }
        js = Regex.Replace(js, @"(\w+)\??\s*:\s*\{[^{}]*;[^{}]*\}(?=\s*[,)])", "$1");
        js = Regex.Replace(js, @"(\w+)\??\s*:\s*\{\s*\[[^\]]*\][^{}]*\}(?=\s*[,)])", "$1");

        // 14b. Remove complex param type annotations like "tiles: Array<{ id: string; ... }>"
        js = Regex.Replace(js, @"(\w+)\??\s*:\s*[A-Za-z_$][A-Za-z0-9_$<>\[\]]*\s*<\{[^}]*\}>(?=\s*[,)])", "$1");

        // 15. Remove : TypeAnnotation from function parameters — (param: Type) -> (param)
        //     Only match types that start with uppercase (PascalCase) or known primitives.
        js = Regex.Replace(js, @"(\w+)\??\s*:\s*(?:(?:number|string|boolean|void|never|null|undefined|any)(?:\[\])*|typeof\s+\w+(?:\.\w+)*|[A-Z](?![A-Z_]*\s*[,)=])[A-Za-z0-9_$<>\[\]|& \t\.']*)\s*(?=\s*[,)=])", "$1");

        // 16. Replace "export const name: Type = " -> "var name = "
        js = Regex.Replace(js, @"export const (\w+)\s*(?::\s*[A-Za-z_$][A-Za-z0-9_$<>\[\]|&\s,\.]*\s*)?=\s*", "var $1 = ");

        // 17. Remove remaining "export function" -> "function"
        js = Regex.Replace(js, @"export function", "function");

        // 18. Remove "export default" -> ""
        js = Regex.Replace(js, @"export default\s+", "");

        return js;
    }
}
