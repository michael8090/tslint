/**
 * @license
 * Copyright 2013 Palantir Technologies, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { isCallExpression, isClassDeclaration, isMethodDeclaration, isPropertyAccessExpression } from "tsutils";
import * as ts from "typescript";

import * as Lint from "../index";

export class Rule extends Lint.Rules.AbstractRule {
    /* tslint:disable:object-literal-sort-keys */
    public static metadata: Lint.IRuleMetadata = {
        ruleName: "call-component-super-lifecycle-hook",
        description: "Always call `super` lifecycle method in react-like component subclasses",
        rationale: Lint.Utils.dedent`
        Component lifecycle hooks should call their super method to make sure the side effects are propagated to the super classes
        In a react-like component, the lifecycle hooks are:
        - componentWillReceiveProps
        - componentWillUpdate
        - componentDidUpdate
        - componentWillMount
        - componentDidMount
        - componentWillUnmount
        `,
        optionsDescription: "Not configurable.",
        options: null,
        // optionExamples: [true],
        type: "functionality",
        // hasFix: true,
        typescriptOnly: false,
    };
    /* tslint:enable:object-literal-sort-keys */

    public static FAILURE_STRING = "Always call `super` lifecycle method in react-like component subclasses";

    public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
        return this.applyWithFunction(sourceFile, walk);
    }
}

function walk(ctx: Lint.WalkContext<void>) {
    return ts.forEachChild(ctx.sourceFile, function cb(node): void {
        if (isClassDeclaration(node)) {
            if (node.heritageClauses && node.heritageClauses.length > 0) {
                checkClassHasSuperReactCall(node, ctx);
            }
        }
        return ts.forEachChild(node, cb);
    });
}

function checkClassHasSuperReactCall(node: ts.ClassDeclaration, ctx: Lint.WalkContext<void>): void {
    node.forEachChild(function cb(c): boolean | undefined {
        if (isMethodDeclaration(c)) {
            const nameText = c.name.getText();
            if (isReactLikeComponentLifecycle(nameText) && c.body && !isSuperCalled(c.body, nameText)) {
                const lines = ctx.sourceFile.getLineStarts();
                const br = ctx.sourceFile.text[lines[1] - 2] === "\r" ? "\r\n" : "\n";
                const indent = c.body.getLastToken().getFullText().search(/\S/) + 3;
                const blanks = " ".repeat(indent);
                ctx.addFailureAtNode(c.getFirstToken(), Rule.FAILURE_STRING, [
                    Lint.Replacement.appendText(c.body.statements.pos, `${br}${blanks}super.componentDidMount.apply(this, arguments);`),
                ]);
            }
        }
        return ts.forEachChild(c, cb);
    });
}

const reactLifecycles = [
    "componentWillReceiveProps",
    "componentWillUpdate",
    "componentDidUpdate",
    "componentWillMount",
    "componentDidMount",
    "componentWillUnmount",
].map((str) => new RegExp(`\\b${str}\\b`));

function isReactLikeComponentLifecycle(name: string) {
    return reactLifecycles.some((reg) => reg.test(name));
}

function isSuperCalled(body: ts.Node, name: string): boolean | undefined {
    function checkIfSuperIsCalled(c: ts.Node) {
        if (isCallExpression(c)) {
            if (isPropertyAccessExpression(c.expression) &&
                c.expression.name.getText() === name &&
                c.expression.expression.kind === ts.SyntaxKind.SuperKeyword
            ) {
                return true;
            }
        }
        return false;
    }
    const isCalled = checkIfSuperIsCalled(body);
    if (isCalled) {
        return true;
    }
    return body.forEachChild((c) => isSuperCalled(c, name));
}
