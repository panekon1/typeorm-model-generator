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

const prettierOptions: Prettier.Options = {
    parser: "typescript",
    endOfLine: "auto",
};

export default function dtoGenerationPhase(
    connectionOptions: IConnectionOptions,
    generationOptions: IGenerationOptions,
    databaseModel: Entity[]
): void {
    console.log("DTO");
    createHandlebarsHelpers(generationOptions);

    const resultPath = generationOptions.resultsPath;
    const dtoPath = path.resolve(resultPath, "./dto");
    if (!fs.existsSync(dtoPath)) {
        fs.mkdirSync(dtoPath);
    }
    generateDtos(databaseModel, generationOptions, dtoPath);
}

function generateDtos(
    databaseModel: Entity[],
    generationOptions: IGenerationOptions,
    entitiesPath: string
) {
    const entityTemplatePath = path.resolve(__dirname, "templates", "dto.mst");
    const entityTemplate = fs.readFileSync(entityTemplatePath, "utf-8");
    const entityCompliedTemplate = Handlebars.compile(entityTemplate, {
        noEscape: true,
    });
    databaseModel.forEach((element) => {
        const casedFileName = toDtoFilename(element.tscName);
        const resultFilePath = path.resolve(
            entitiesPath,
            `${casedFileName}.ts`
        );
        const rendered = entityCompliedTemplate(element);
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
        fs.writeFileSync(resultFilePath, formatted, {
            encoding: "utf-8",
            flag: "w",
        });
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

function toDtoFilename(str) {
    return `${changeCase.paramCase(str)}.dto`;
}

function createHandlebarsHelpers(generationOptions: IGenerationOptions): void {
    Handlebars.registerHelper("json", (context) => {
        const json = JSON.stringify(context);
        const withoutQuotes = json.replace(/"([^(")"]+)":/g, "$1:");
        return withoutQuotes.slice(1, withoutQuotes.length - 1);
    });
    Handlebars.registerHelper("toDtoName", (str) => {
        return `${changeCase.pascalCase(str)}Dto`;
    });
    Handlebars.registerHelper("toDtoFileName", toDtoFilename);
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
        return retStr;
    });
    Handlebars.registerHelper(
        "toRelation",
        (entityType: string, relationType: Relation["relationType"]) => {
            let retVal = entityType;
            if (relationType === "ManyToMany" || relationType === "OneToMany") {
                retVal = `${retVal}[]`;
            }
            if (generationOptions.lazy) {
                retVal = `Promise<${retVal}>`;
            }
            return retVal;
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
