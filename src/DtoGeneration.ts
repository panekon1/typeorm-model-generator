import * as changeCase from "change-case";
import * as fs from "fs";
import * as Handlebars from "handlebars";
import { EOL } from "os";
import * as path from "path";
import * as Prettier from "prettier";
import IConnectionOptions from "./IConnectionOptions";
import IGenerationOptions, { eolConverter } from "./IGenerationOptions";
import { Entity } from "./models/Entity";
import { Relation } from "./models/Relation";
import { toDirName } from "./common";

const prettierOptions: Prettier.Options = {
    parser: "typescript",
    endOfLine: "auto",
};

export default function dtoGenerationPhase(
    connectionOptions: IConnectionOptions,
    generationOptions: IGenerationOptions,
    databaseModel: Entity[]
): void {
    createHandlebarsHelpers(generationOptions);

    const resultPath = generationOptions.resultsPath;
    if (!fs.existsSync(resultPath)) {
        fs.mkdirSync(resultPath);
    }
    generateDtos(databaseModel, generationOptions, resultPath);
}

function generateDto(
    element: Entity,
    generationOptions: IGenerationOptions,
    filePath: string,
    template: HandlebarsTemplateDelegate<any>
) {
    const rendered = template(element);
    const withImportStatements = removeUnusedImports(
        EOL !== eolConverter[generationOptions.convertEol]
            ? rendered.replace(
                  /(\r\n|\n|\r)/gm,
                  eolConverter[generationOptions.convertEol]
              )
            : rendered
    );
    let formatted = "";
    try {
        formatted = Prettier.format(withImportStatements, prettierOptions);
    } catch (error) {
        console.error(
            "There were some problems with model generation for table: ",
            element.sqlName
        );
        console.error(error);
        formatted = withImportStatements;
    }
    fs.writeFileSync(filePath, formatted, {
        encoding: "utf-8",
        flag: "w",
    });
}

function generateDtos(
    databaseModel: Entity[],
    generationOptions: IGenerationOptions,
    entitiesPath: string
) {
    const dtoTemplatePath = path.resolve(__dirname, "templates", "dto.mst");
    const dtoTemplate = fs.readFileSync(dtoTemplatePath, "utf-8");
    const dtoCompiledTemplate = Handlebars.compile(dtoTemplate, {
        noEscape: true,
    });
    const dtoEditTemplatePath = path.resolve(
        __dirname,
        "templates",
        "dto-edit.mst"
    );
    const dtoEditTemplate = fs.readFileSync(dtoEditTemplatePath, "utf-8");
    const dtoEditCompiledTemplate = Handlebars.compile(dtoEditTemplate, {
        noEscape: true,
    });
    databaseModel.forEach((element) => {
        const dirName = toDirName(element.tscName);
        const dirPath = path.resolve(entitiesPath, dirName);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath);
        }
        const dtoFileName = toDtoFilename(element.tscName);
        const dtoFilePath = path.resolve(dirPath, `${dtoFileName}.ts`);
        const dtoEditFileName = toDtoEditFilename(element.tscName);
        const dtoEditFilePath = path.resolve(dirPath, `${dtoEditFileName}.ts`);
        generateDto(
            element,
            generationOptions,
            dtoFilePath,
            dtoCompiledTemplate
        );
        generateDto(
            element,
            generationOptions,
            dtoEditFilePath,
            dtoEditCompiledTemplate
        );
    });
}

function removeUnusedImports(rendered: string) {
    const openBracketIndex = rendered.indexOf("{") + 1;
    const closeBracketIndex = rendered.indexOf("}");
    const imports = rendered
        .substring(openBracketIndex, closeBracketIndex)
        .split(",");
    const restOfEntityDefinition = rendered.substring(closeBracketIndex);
    const distinctImports = imports.filter(
        (v) =>
            restOfEntityDefinition.indexOf(`@${v}`) !== -1 ||
            restOfEntityDefinition.indexOf(`=> ${v})`) !== -1
    );
    return `${rendered.substring(0, openBracketIndex)}${distinctImports.join(
        ","
    )}${restOfEntityDefinition}`;
}

function toDtoName(str) {
    return `${changeCase.pascalCase(str)}Dto`;
}

function toDtoFilename(str) {
    return `${changeCase.paramCase(str)}.dto`;
}

function toDtoEditFilename(str) {
    return `${changeCase.paramCase(str)}-edit.dto`;
}

function createHandlebarsHelpers(generationOptions: IGenerationOptions): void {
    Handlebars.registerHelper("json", (context) => {
        const json = JSON.stringify(context);
        const withoutQuotes = json.replace(/"([^(")"]+)":/g, "$1:");
        return withoutQuotes.slice(1, withoutQuotes.length - 1);
    });
    Handlebars.registerHelper("toDtoName", toDtoName);
    Handlebars.registerHelper("toDtoFileName", toDtoFilename);
    Handlebars.registerHelper("toDirName", toDirName);
    Handlebars.registerHelper("printPropertyVisibility", () =>
        generationOptions.propertyVisibility !== "none"
            ? `${generationOptions.propertyVisibility} `
            : ""
    );
    Handlebars.registerHelper("toPropertyName", (str) => {
        let retStr = "";
        switch (generationOptions.convertCaseProperty) {
            case "camel":
                retStr = changeCase.camelCase(str);
                break;
            case "pascal":
                retStr = changeCase.pascalCase(str);
                break;
            case "none":
                retStr = str;
                break;
            case "snake":
                retStr = changeCase.snakeCase(str);
                break;
            default:
                throw new Error("Unknown case style");
        }
        // eslint-disable-next-line no-restricted-globals
        if (!isNaN(+retStr[0])) {
            retStr = `_${retStr}`;
        }
        return retStr;
    });
    Handlebars.registerHelper(
        "toRelation",
        (entityType: string, relationType: Relation["relationType"]) => {
            let retVal = entityType;
            if (relationType === "ManyToMany" || relationType === "OneToMany") {
                retVal = `${retVal}[]`;
            }
            return retVal;
        }
    );
    Handlebars.registerHelper(
        "toRelationId",
        (relationType: Relation["relationType"]) => {
            if (relationType === "ManyToMany" || relationType === "OneToMany") {
                return `number[]`;
            }
            return `number`;
        }
    );
    Handlebars.registerHelper(
        "toRelationIdGqlType",
        (relationType: Relation["relationType"]) => {
            if (relationType === "ManyToMany" || relationType === "OneToMany") {
                return `[Int]`;
            }
            return `Int`;
        }
    );
    Handlebars.registerHelper(
        "toRelationGqlType",
        (entityType: string, relationType: Relation["relationType"]) => {
            if (relationType === "ManyToMany" || relationType === "OneToMany") {
                return `[${toDtoName(entityType)}]`;
            }
            return toDtoName(entityType);
        }
    );
    Handlebars.registerHelper("defaultExport", () =>
        generationOptions.exportType === "default" ? "default" : ""
    );
    Handlebars.registerHelper("localImport", (entityName: string) =>
        generationOptions.exportType === "default"
            ? entityName
            : `{${entityName}}`
    );
    Handlebars.registerHelper("strictMode", () =>
        generationOptions.strictMode !== "none"
            ? generationOptions.strictMode
            : ""
    );
    Handlebars.registerHelper({
        and: (v1, v2) => v1 && v2,
        eq: (v1, v2) => v1 === v2,
        gt: (v1, v2) => v1 > v2,
        gte: (v1, v2) => v1 >= v2,
        lt: (v1, v2) => v1 < v2,
        lte: (v1, v2) => v1 <= v2,
        ne: (v1, v2) => v1 !== v2,
        or: (v1, v2) => v1 || v2,
    });
}
