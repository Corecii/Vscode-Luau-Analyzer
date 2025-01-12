import * as vscode from "vscode";
import FileAnalyzer from "./FileAnalyzer";
import { installTypes } from "./Utils";

function getWorkspacePath(): string | null {
    let folders = vscode.workspace.workspaceFolders;
    if (!folders) {
        return null;
    }
    return folders[0].uri.fsPath;
}

export const ConfigurationName = "vscode-luau-analyzer";
export let Extension: ExtensionClass;
export let ExtensionContext: vscode.ExtensionContext;

export let ExtensionSettings: {
    RojoProjectPath: string,
    TypeDefsPath: string,
    UsesLuauAnalyzeRojo: boolean,
    AnalyzerCommand: string,
    IgnoredPaths: string[],
};

let SourceMap: string = "";
let AnnotatedSource: string = "";

class ExtensionClass {
    collection: vscode.DiagnosticCollection;
    fileAnalyzers: Map<string, FileAnalyzer>;
    context: vscode.ExtensionContext;
    
    constructor(context: vscode.ExtensionContext) {
        this.fileAnalyzers = new Map<string, FileAnalyzer>();
        this.context = context;
        
        this.collection = vscode.languages.createDiagnosticCollection("luau");
        context.subscriptions.push(this.collection);
    }
    
    deleteFileAnalyzer(document: vscode.TextDocument) {
        let path = document.uri.fsPath;
        this.fileAnalyzers.delete(path);
    }
    
    updateDiagnostics(document: vscode.TextDocument): void {
        let path = document.uri.fsPath;
        if (document && (path.endsWith(".lua") || path.endsWith(".luau"))) {
            let analyzer = this.fileAnalyzers.get(path);
            if (!analyzer) {
                analyzer = new FileAnalyzer(document, this.collection, getWorkspacePath());
                this.fileAnalyzers.set(path, analyzer);
            }
            analyzer.runDiagnostics();
        }
    }
    
    updateAllFiles() {
        this.fileAnalyzers.forEach((analyzer) => {
            analyzer.rebuildArgs();
            analyzer.runDiagnostics();
        })
    }
    
    rojoGetActiveFile(): FileAnalyzer | undefined {
        let config = vscode.workspace.getConfiguration(ConfigurationName);
        
        if (config.get("usesLuauAnalyzeRojo") !== true) {
            vscode.window.showErrorMessage(`${ConfigurationName}: Cannot show file! Uses Luau Analyze Rojo is not enabled in configurations!`);
            return undefined;
        }
        
        let textEditor = vscode.window.activeTextEditor 
        if (!textEditor) { return; }
        let fileAnalyzer = this.fileAnalyzers.get(textEditor.document.uri.fsPath)!;
        return fileAnalyzer;
    }
    
    registerCommands() {
        this.context.subscriptions.push(
            vscode.commands.registerCommand(ConfigurationName + ".showSourceMap", () => {
                let fileAnalyzer = this.rojoGetActiveFile();
                if (!fileAnalyzer) { return; }
                SourceMap = fileAnalyzer.executeAnalyzer(["--dump-source-map"])
                
                vscode.workspace.openTextDocument({
                    language: "text",
                    content: SourceMap
                }).then((document) => {
                    vscode.window.showTextDocument(document);
                })
            }),
            vscode.commands.registerCommand(ConfigurationName + ".showAnnotations", () => {
                let fileAnalyzer = this.rojoGetActiveFile();
                if (!fileAnalyzer) { return; }
                AnnotatedSource = fileAnalyzer.executeAnalyzer(["--annotate"])
                
                vscode.workspace.openTextDocument({
                    language: "lua",
                    content: AnnotatedSource
                }).then((document) => {
                    vscode.window.showTextDocument(document);
                })
            }),
            vscode.commands.registerCommand(ConfigurationName + ".installTypes", () => {
                installTypes()
            }),
        )
    }
    
    updateConfigs() {
        let config = vscode.workspace.getConfiguration(ConfigurationName);
        
        let newSettings = {
            RojoProjectPath: config.get("rojoProject", "defualt.project.json"),
            TypeDefsPath: config.get("typeDefinition", "globalTypes.d.lua"),
            UsesLuauAnalyzeRojo: config.get("usesLuauAnalyzeRojo") as boolean,
            AnalyzerCommand: config.get("analyzerCommand", "luau-analyze"),
            IgnoredPaths: config.get("ignoredPaths", []) as string[],
        }
        
        ExtensionSettings = newSettings;
        
        if (!ExtensionSettings.AnalyzerCommand) {
            vscode.window.showErrorMessage(`${ConfigurationName}: Luau Analyzer command not found! Setting command to: \`luau-analyze\``);
            ExtensionSettings.AnalyzerCommand = "luau-analyze";
            config.update("analyzerCommand", ExtensionSettings.AnalyzerCommand, true);
        }
        
        this.updateAllFiles();
    }
    
    activate() {
        this.updateConfigs()
        this.context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event) => {
            this.updateConfigs();
        }));
        
        if (vscode.window.activeTextEditor) {
            this.updateDiagnostics(vscode.window.activeTextEditor.document);
        }
        
        this.registerCommands();
        
        this.context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument((document) => {
                this.updateDiagnostics(document);
            }),
            vscode.workspace.onDidChangeTextDocument((event) => {
                this.updateDiagnostics(event.document);
            }),
            vscode.workspace.onDidCloseTextDocument((document) => {
                this.collection.delete(document.uri);
                this.deleteFileAnalyzer(document);
            }),
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (editor) {
                    this.updateDiagnostics(editor.document);
                }
            }),
        );
    }
    
    deactivate() {
        this.collection.dispose();
        this.fileAnalyzers.clear();
    }
}

export function activate(context: vscode.ExtensionContext) {    
    Extension = new ExtensionClass(context);
    Extension.activate();
    console.log("Luau Analyzer extension activated.");
}

export function deactivate() {
    Extension.deactivate()
}
