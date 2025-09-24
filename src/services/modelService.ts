import * as vscode from "vscode";
import { MetadataCache } from "../cache/cache";
import { SourceCodeService } from "./sourceCodeService";

export class ModelService {
  private sourceCodeService: SourceCodeService;
  constructor() {
    this.sourceCodeService = new SourceCodeService();
  }

  /**
   * Adds a complete model file to the workspace edit.
   *
   * @param edit - The workspace edit to add the changes to
   * @param targetFilePath - The path where the model file will be created
   * @param modelName - The name of the new model class
   * @param classBody - The complete class body content
   * @param dataSource - Optional datasource for the model
   * @param existingImports - Set of imports that should be included
   * @param isComponent - Whether this is a component model (affects export and class declaration)
   * @param cache - Optional metadata cache to lookup datasource information
   * @param docs - Optional documentation string for the model
   */
  public async addModelToWorkspaceEdit(
    edit: vscode.WorkspaceEdit,
    targetFilePath: string,
    modelName: string,
    classBody?: string,
    dataSource?: string,
    existingImports?: Set<string>,
    isComponent: boolean = false,
    cache?: MetadataCache,
    docs?: string
  ): Promise<void> {
    const lines: string[] = [];

    // Determine required imports
    const imports = new Set(["BaseModel", "UUID", "Model", "Field"]);

    // Add existing imports if provided
    if (existingImports) {
      existingImports.forEach((imp) => imports.add(imp));
    }

    if (classBody) {
      // Analyze the class body to determine additional needed imports
      const bodyImports = this.sourceCodeService.extractImportsFromClassBody(classBody);
      bodyImports.forEach((imp) => imports.add(imp));
    }

    // Add import statement
    const sortedImports = Array.from(imports).sort();
    lines.push(`import { ${sortedImports.join(", ")} } from "slingr-framework";`);

    // Add datasource import if applicable
    if (dataSource) {
      // Use the new findDataSourcePath function for accurate import resolution
      try {
        const dataSourceImport = await this.sourceCodeService.findDataSourcePath(dataSource, targetFilePath, cache);
        if (dataSourceImport) {
          lines.push(dataSourceImport);
          lines.push("");
        }
      } catch (error) {
        console.warn("Could not resolve datasource import, using fallback:", error);
        // Fallback to generic import
        const cleanDataSource = dataSource.replace(/['"]/g, "");
        lines.push(`import { ${cleanDataSource} } from '../dataSources/${cleanDataSource}';`);
        lines.push("");
      }
    }

    // Add model decorator
    if (dataSource) {
      lines.push(`@Model({`);
      if (docs) {
        lines.push(`\tdataSource: ${dataSource},`);
        lines.push(`\tdocs: "${docs}"`);
      } else {
        lines.push(`\tdataSource: ${dataSource}`);
      }
      lines.push(`})`);
    } else if (docs) {
      lines.push(`@Model({`);
      lines.push(`\tdocs: "${docs}"`);
      lines.push(`})`);
    }
     else {
      lines.push(`@Model()`);
    }

    // Add class declaration (export only if not a component model)
    const exportKeyword = isComponent ? "" : "export ";
    lines.push(`${exportKeyword}class ${modelName} extends BaseModel {`);
    lines.push(``);
    lines.push(`\t@Field({`);
    lines.push(`\t\tprimaryKey: true,`);
    lines.push(`\t})`);
    lines.push(`\t@UUID({`);
    lines.push(`\t\tgenerated: true,`);
    lines.push(`\t})`);
    lines.push(`\tid!: string`);

    // Add class body (if not empty)
    if (classBody && classBody.trim()) {
      lines.push("");
      lines.push(classBody);
      lines.push("");
    }

    lines.push(`}`);

    // Create the file content and add it to the workspace edit
    const fileContent = lines.join("\n");
    const uri = vscode.Uri.file(targetFilePath);
    edit.createFile(uri, { ignoreIfExists: false });
    edit.insert(uri, new vscode.Position(0, 0), fileContent);
  }

  /**
   * Generates model file content as a string (for backward compatibility or other use cases).
   *
   * @param modelName - The name of the new model class
   * @param classBody - The complete class body content
   * @param dataSource - Optional datasource for the model
   * @param existingImports - Set of imports that should be included
   * @param isComponent - Whether this is a component model (affects export and class declaration)
   * @param targetFilePath - Optional path where the model file will be created (for accurate relative import calculation)
   * @param cache - Optional metadata cache to lookup datasource information
   * @returns The complete model file content
   */
  public async generateModelFileContent(
    modelName: string,
    classBody: string,
    dataSource?: string,
    existingImports?: Set<string>,
    isComponent: boolean = false,
    targetFilePath?: string,
    cache?: MetadataCache,
    docs?: string
  ): Promise<string> {
    // Create a temporary workspace edit to generate the content
    const tempEdit = new vscode.WorkspaceEdit();
    const tempFilePath = targetFilePath || "/tmp/temp-model.ts";

    await this.addModelToWorkspaceEdit(
      tempEdit,
      tempFilePath,
      modelName,
      classBody,
      dataSource,
      existingImports,
      isComponent,
      cache,
      docs
    );

    // Extract the content from the workspace edit
    const uri = vscode.Uri.file(tempFilePath);
    const edits = tempEdit.get(uri);

    // Find the insert edit and return its content
    for (const edit of edits) {
      if (edit instanceof vscode.TextEdit && edit.range.isEmpty) {
        return edit.newText;
      }
    }

    return "";
  }
}
