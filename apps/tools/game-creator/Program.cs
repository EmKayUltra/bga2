using System.CommandLine;
using Bga2.GameCreator.Commands;

var rootCommand = new RootCommand("BGA2 Game Creator — AI-powered game package generator");
rootCommand.AddCommand(IngestCommand.Create());
rootCommand.AddCommand(GenerateCommand.Create());
return await rootCommand.InvokeAsync(args);
