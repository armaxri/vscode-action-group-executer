// Small server-like script that prints a few lines and exits.
const name = process.argv[2] ?? "app";
let count = 0;
const timer = setInterval(() => {
    count++;
    console.log(`${name}: tick ${count}`);
    if (count === 5) {
        clearInterval(timer);
        console.log(`${name}: done`);
    }
}, 500);
