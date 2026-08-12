const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");

const app = express();

const upload = multer({
    dest: path.join(__dirname, "uploads")
});

app.use(express.json());
app.use(express.static(__dirname));

const TEMPLATE = path.join(
    __dirname,
    "android-template"
);

const BUILDS = path.join(
    __dirname,
    "builds"
);

if (!fs.existsSync(BUILDS)) {
    fs.mkdirSync(BUILDS);
}

app.post(
    "/api/build",
    upload.single("icon"),
    (req, res) => {

        const website =
            req.body.website;

        const appName =
            req.body.appName;

        const packageName =
            req.body.packageName;

        if (
            !website ||
            !appName ||
            !packageName
        ) {
            return res.status(400).json({
                error: "Required information missing"
            });
        }

        if (
            !/^https?:\/\//i.test(website)
        ) {
            return res.status(400).json({
                error: "Invalid website URL"
            });
        }

        if (
            !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/
                .test(packageName)
        ) {
            return res.status(400).json({
                error: "Invalid package name"
            });
        }

        const id =
            crypto.randomBytes(8).toString("hex");

        const buildDir =
            path.join(BUILDS, id);

        fs.cpSync(
            TEMPLATE,
            buildDir,
            { recursive: true }
        );

        /*
         * Yahan Android template ke placeholders
         * replace honge.
         */

        replaceInDirectory(
            buildDir,
            "__APP_NAME__",
            appName
        );

        replaceInDirectory(
            buildDir,
            "__PACKAGE_NAME__",
            packageName
        );

        replaceInDirectory(
            buildDir,
            "__WEBSITE_URL__",
            website
        );

        /*
         * Icon upload nahi hua to template ka
         * default icon use hoga.
         */

        if (req.file) {

            const destination =
                path.join(
                    buildDir,
                    "app/src/main/res/drawable/app_icon.png"
                );

            fs.copyFileSync(
                req.file.path,
                destination
            );

        }

        const gradlew =
            process.platform === "win32"
                ? "gradlew.bat"
                : "./gradlew";

        execFile(
            gradlew,
            ["assembleRelease"],
            {
                cwd: buildDir,
                timeout: 10 * 60 * 1000
            },
            (error, stdout, stderr) => {

                if (error) {

                    console.error(stderr);

                    return res.status(500).json({
                        error:
                            "APK build failed"
                    });
                }

                const apk =
                    path.join(
                        buildDir,
                        "app/build/outputs/apk/release/app-release.apk"
                    );

                if (!fs.existsSync(apk)) {

                    return res.status(500).json({
                        error:
                            "APK file was not created"
                    });
                }

                res.json({
                    success: true,
                    download:
                        `/download/${id}`
                });

            }
        );
    }
);


app.get(
    "/download/:id",
    (req, res) => {

        const apk =
            path.join(
                BUILDS,
                req.params.id,
                "app/build/outputs/apk/release/app-release.apk"
            );

        if (!fs.existsSync(apk)) {

            return res.status(404).send(
                "APK not found"
            );

        }

        res.download(
            apk,
            "app-release.apk"
        );
    }
);


function replaceInDirectory(
    directory,
    search,
    replacement
) {

    const items =
        fs.readdirSync(
            directory,
            { withFileTypes: true }
        );

    for (const item of items) {

        const full =
            path.join(
                directory,
                item.name
            );

        if (item.isDirectory()) {

            replaceInDirectory(
                full,
                search,
                replacement
            );

        } else {

            try {

                let content =
                    fs.readFileSync(
                        full,
                        "utf8"
                    );

                if (content.includes(search)) {

                    content =
                        content.replaceAll(
                            search,
                            replacement
                        );

                    fs.writeFileSync(
                        full,
                        content
                    );
                }

            } catch {
                // Binary files ignore
            }
        }
    }
}


app.listen(
    3000,
    () => {
        console.log(
            "AppForge running on port 3000"
        );
    }
);
