/*
 * Copyright (c) 2023, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: MIT
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/MIT
 */

import type { types, NodePath } from '@babel/core';
import type { BabelAPI, BabelTypes } from './types';

function defaultImport(
    t: BabelTypes,
    specifiers: (
        | types.ImportDefaultSpecifier
        | types.ImportNamespaceSpecifier
        | types.ImportSpecifier
    )[]
) {
    const defaultImport = specifiers.find((s) => t.isImportDefaultSpecifier(s));
    return defaultImport && defaultImport.local.name;
}

export default function ({ types: t }: BabelAPI): (path: NodePath<types.Program>) => void {
    return function (path) {
        const body = path.get('body');
        const importStatements = body.filter((s) =>
            s.isImportDeclaration()
        ) as NodePath<types.ImportDeclaration>[];
        const visited = new Map<string, NodePath<types.ImportDeclaration>>();

        importStatements.forEach((importPath) => {
            const sourceLiteral = importPath.node.source;

            // If the import is of the type import * as X, just ignore it since we can't dedupe
            if (importPath.node.specifiers.some((_) => t.isImportNamespaceSpecifier(_))) {
                return;
            }

            // If we have seen the same source, we will try to dedupe it
            if (visited.has(sourceLiteral.value)) {
                const visitedImport = visited.get(sourceLiteral.value);
                const visitedSpecifiers = visitedImport!.node.specifiers;
                const visitedDefaultImport = defaultImport(t, visitedSpecifiers);

                // We merge all the named imports unless is a default with the same name
                let canImportBeRemoved = true;
                importPath.node.specifiers.forEach((s) => {
                    if (visitedDefaultImport && t.isImportDefaultSpecifier(s)) {
                        if (visitedDefaultImport !== s.local.name) {
                            canImportBeRemoved = false;
                        }
                    } else {
                        visitedSpecifiers.push(s);
                    }
                });

                if (canImportBeRemoved) {
                    importPath.remove();
                }

                // We need to sort the imports due to a bug in babel where default must be first
                visitedSpecifiers.sort((a) => (t.isImportDefaultSpecifier(a) ? -1 : 1));
            } else {
                visited.set(sourceLiteral.value, importPath);
            }
        });
    };
}
