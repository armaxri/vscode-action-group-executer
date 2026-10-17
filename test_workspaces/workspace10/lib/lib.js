// Pretends to run a test suite.
console.log("lib: running tests");
for (const test of ["parse", "format", "validate"]) {
    console.log(`lib: ✔ ${test}`);
}
console.log("lib: all tests passed");
