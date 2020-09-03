import * as changeCase from "change-case";

// eslint-disable-next-line import/prefer-default-export
export function toDirName(tscName: string) {
    return changeCase.paramCase(tscName);
}
