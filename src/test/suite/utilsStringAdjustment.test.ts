import * as assert from "assert";
import * as vscode from "vscode";
import * as utils from "../../utils";

suite("ActionGroup Extension utils string adjustment Test Suite", () => {
    vscode.window.showInformationMessage("Start all tests.");

    test("test simple \\n", () => {
        assert.strictEqual(utils.userInput2String("bla\\nblub"), "bla\nblub");
    });

    test("simple args split", () => {
        const result = utils.splitArguments("hallo welt!");
        const expected = ["hallo", "welt!"];
        assert.deepStrictEqual(result, expected);
    });

    test("args split with string 1", () => {
        const result = utils.splitArguments(
            '-p "hello b\\"ar baz" -f /^ [^ ]+ $/ -c -d -e'
        );
        const expected = [
            "-p",
            'hello b"ar baz',
            "-f",
            "/^",
            "[^",
            "]+",
            "$/",
            "-c",
            "-d",
            "-e",
        ];
        assert.deepStrictEqual(result, expected);
    });

    test("args split with string 2", () => {
        const result = utils.splitArguments(
            "-p 'hello b\\\"ar baz' -f /^ [^ ]+ $/ -c -d -e"
        );
        const expected = [
            "-p",
            'hello b\\"ar baz',
            "-f",
            "/^",
            "[^",
            "]+",
            "$/",
            "-c",
            "-d",
            "-e",
        ];
        assert.deepStrictEqual(result, expected);
    });

    test("args split with string connected to argument", () => {
        const result = utils.splitArguments('-p="hello b\\"ar baz" -f');
        const expected = ['-p=hello b"ar baz', "-f"];
        assert.deepStrictEqual(result, expected);
    });
});
