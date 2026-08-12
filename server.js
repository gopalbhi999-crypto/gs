const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const PUBLIC_SERVER_URL =
    process.env.PUBLIC_SERVER_URL || "";

const WORKFLOW_FILE =
    "build-apk.yml";

const ROOT =
    __dirname;

const BUILD_DIR =
    path.join(ROOT, "build-data");

if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR, {
        recursive: true
    });
}

app.use(cors());

app.use(
    express.json({
        limit: "2mb"
    })
);

const upload =
    multer({
        dest: BUILD_DIR,
        limits: {
            fileSize: 5 * 1024 * 1024
        }
    });


function requiredConfig() {

    if (
        !GITHUB_OWNER ||
        !GITHUB_REPO ||
        !GITHUB_TOKEN
    ) {

        return false;

    }

    return true;
}


function cleanPackageName(value) {

    return String(value || "")
        .trim()
        .replace(/[^a-zA-Z0-9_.]/g, "");

}


function safeText(value, max = 20000) {

    return String(value || "")
        .slice(0, max);

}


/*
    Health check
*/

app.get("/", (req, res) => {

    res.json({
        ok: true,
        service: "AppForge API"
    });

});


/*
    AI privacy policy fallback/API.
    
    Real AI provider baad mein add kar sakte ho.
*/

app.post(
    "/api/generate-policy",
    (req, res) => {

        const appName =
            safeText(
                req.body.appName,
                100
            ) || "Your App";

        const website =
            safeText(
                req.body.website,
                500
            );

        const policy = `
Privacy Policy for ${appName}

Last Updated: ${new Date().toLocaleDateString()}

This Privacy Policy explains how ${appName} handles information when users access the application.

1. Information We Collect

The application may collect information necessary to provide and improve its services.

2. Website Content

This application displays content from:

${website}

The website may have its own privacy policy and terms.

3. Use of Information

Information may be used to provide functionality, maintain the application and improve user experience.

4. Third-Party Services

The application may interact with third-party services used by the website.

5. Data Security

Reasonable security measures may be used to protect information.

6. Children's Privacy

The application is not intended to knowingly collect personal information from children.

7. Changes

This Privacy Policy may be updated from time to time.

8. Contact

For privacy questions, contact the application owner.

IMPORTANT:
This is a general draft and should be reviewed and customized according to the actual data collected by your application and applicable laws.
`;

        res.json({
            policy
        });

    }
);


/*
    Create APK build
*/

app.post(
    "/api/build",
    upload.single("icon"),
    async (req, res) => {

        try {

            if (!requiredConfig()) {

                return res.status(500).json({
                    error:
                        "Server configuration missing. Set GITHUB_OWNER, GITHUB_REPO and GITHUB_TOKEN."
                });

            }


            const website =
                safeText(
                    req.body.website,
                    1000
                ).trim();


            const appName =
                safeText(
                    req.body.appName,
                    80
                ).trim();


            const packageName =
                cleanPackageName(
                    req.body.packageName
                );


            if (
                !/^https?:\/\//i.test(
                    website
                )
            ) {

                return res.status(400).json({
                    error:
                        "Website must start with http:// or https://"
                });

            }


            if (!appName) {

                return res.status(400).json({
                    error:
                        "App name is required."
                });

            }


            if (
                !/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/
                    .test(packageName)
            ) {

                return res.status(400).json({
                    error:
                        "Invalid Android package name."
                });

            }


            const buildId =
                crypto
                    .randomBytes(16)
                    .toString("hex");


            const buildFolder =
                path.join(
                    BUILD_DIR,
                    buildId
                );


            fs.mkdirSync(
                buildFolder,
                {
                    recursive: true
                }
            );


            let iconFile = null;


            if (req.file) {

                const extension =
                    path.extname(
                        req.file.originalname
                    )
                    .toLowerCase();


                const allowed =
                    [
                        ".png",
                        ".jpg",
                        ".jpeg"
                    ];


                if (
                    !allowed.includes(
                        extension
                    )
                ) {

                    return res.status(400).json({
                        error:
                            "Only PNG/JPG icons are supported."
                    });

                }


                iconFile =
                    path.join(
                        buildFolder,
                        "icon" + extension
                    );


                fs.renameSync(
                    req.file.path,
                    iconFile
                );

            }


            const config = {

                buildId,

                website,

                appName,

                packageName,

                loader:
                    safeText(
                        req.body.loader,
                        30
                    ),

                privacyPolicy:
                    safeText(
                        req.body.privacyPolicy,
                        20000
                    ),

                homeButton:
                    req.body.homeButton ===
                    "true",

                refreshButton:
                    req.body.refreshButton ===
                    "true",

                shareButton:
                    req.body.shareButton ===
                    "true",

                ratingButton:
                    req.body.ratingButton ===
                    "true",

                browserButton:
                    req.body.browserButton ===
                    "true",

                darkMode:
                    req.body.darkMode ===
                    "true",

                icon:
                    iconFile
                        ? path.basename(
                            iconFile
                        )
                        : null

            };


            fs.writeFileSync(
                path.join(
                    buildFolder,
                    "config.json"
                ),
                JSON.stringify(
                    config,
                    null,
                    2
                )
            );


            if (!PUBLIC_SERVER_URL) {

                return res.status(500).json({
                    error:
                        "PUBLIC_SERVER_URL is not configured."
                });

            }


            /*
                GitHub Actions workflow dispatch.
            */

            const githubURL =
                `https://api.github.com/repos/` +
                `${encodeURIComponent(GITHUB_OWNER)}/` +
                `${encodeURIComponent(GITHUB_REPO)}/` +
                `actions/workflows/` +
                `${WORKFLOW_FILE}/dispatches`;


            const response =
                await fetch(
                    githubURL,
                    {
                        method: "POST",

                        headers: {

                            "Accept":
                                "application/vnd.github+json",

                            "Authorization":
                                `Bearer ${GITHUB_TOKEN}`,

                            "X-GitHub-Api-Version":
                                "2026-03-10",

                            "Content-Type":
                                "application/json"

                        },

                        body:
                            JSON.stringify({

                                ref: "main",

                                inputs: {

                                    build_id:
                                        buildId

                                }

                            })

                    }
                );


            if (!response.ok) {

                const errorText =
                    await response.text();

                console.error(
                    errorText
                );


                return res.status(500).json({
                    error:
                        "Could not start GitHub Actions build."
                });

            }


            res.json({

                success: true,

                jobId:
                    buildId,

                message:
                    "APK build started."

            });


        } catch (error) {

            console.error(
                error
            );


            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);


/*
    Build configuration endpoint.

    GitHub Actions runner uses this to
    download the requested build config.
*/

app.get(
    "/api/build-config/:id",
    (req, res) => {

        const id =
            req.params.id;


        if (
            !/^[a-f0-9]{32}$/i.test(id)
        ) {

            return res.status(400).json({
                error:
                    "Invalid build ID."
            });

        }


        const folder =
            path.join(
                BUILD_DIR,
                id
            );


        const configFile =
            path.join(
                folder,
                "config.json"
            );


        if (
            !fs.existsSync(
                configFile
            )
        ) {

            return res.status(404).json({
                error:
                    "Build not found."
            });

        }


        res.sendFile(
            configFile
        );

    }
);


/*
    Download uploaded icon.
*/

app.get(
    "/api/build-icon/:id",
    (req, res) => {

        const id =
            req.params.id;


        if (
            !/^[a-f0-9]{32}$/i.test(id)
        ) {

            return res.status(400).end();

        }


        const folder =
            path.join(
                BUILD_DIR,
                id
            );


        const files =
            fs.readdirSync(
                folder,
                {
                    withFileTypes: true
                }
            );


        const icon =
            files.find(
                file =>
                    file.name.startsWith(
                        "icon."
                    )
            );


        if (!icon) {

            return res.status(404).end();

        }


        res.sendFile(
            path.join(
                folder,
                icon.name
            )
        );

    }
);


/*
    Build status endpoint.
    
    GitHub Actions status integration
    next step mein add kar sakte hain.
*/

app.get(
    "/api/build/:id",
    (req, res) => {

        const id =
            req.params.id;


        const config =
            path.join(
                BUILD_DIR,
                id,
                "config.json"
            );


        if (
            !fs.existsSync(config)
        ) {

            return res.status(404).json({
                error:
                    "Build not found."
            });

        }


        res.json({

            buildId: id,

            status:
                "processing"

        });

    }
);


app.listen(
    PORT,
    () => {

        console.log(
            `AppForge API running on port ${PORT}`
        );

    }
);
