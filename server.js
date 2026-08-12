const express = require("express");
const cors = require("cors");
const multer = require("multer");
const AdmZip = require("adm-zip");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const TOKEN = process.env.GITHUB_TOKEN;

const WORKFLOW = "build-apk.yml";

const DATA_DIR = path.join(__dirname, "build-data");

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(cors());

app.use(express.json({
    limit: "2mb"
}));

const upload = multer({
    dest: DATA_DIR,
    limits: {
        fileSize: 5 * 1024 * 1024
    }
});


function githubHeaders() {

    return {
        "Accept":
            "application/vnd.github+json",

        "Authorization":
            `Bearer ${TOKEN}`,

        "X-GitHub-Api-Version":
            "2026-03-10"
    };
}


function safe(value, max = 20000) {

    return String(value || "")
        .trim()
        .slice(0, max);

}


function validPackage(value) {

    return /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/
        .test(value);

}


/* HOME */

app.get("/", (req, res) => {

    res.json({
        ok: true,
        service: "AppForge API"
    });

});


/* PRIVACY POLICY */

app.post(
    "/api/generate-policy",
    (req, res) => {

        const appName =
            safe(req.body.appName, 100) ||
            "Your App";

        const website =
            safe(req.body.website, 500);

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
This is a general draft. Review and customize it according to the actual data collected by your app and applicable laws.
`;

        res.json({
            policy
        });

    }
);


/* CREATE BUILD */

app.post(
    "/api/build",
    upload.single("icon"),
    async (req, res) => {

        try {

            if (
                !OWNER ||
                !REPO ||
                !TOKEN
            ) {

                return res.status(500).json({
                    error:
                        "GitHub server configuration missing."
                });

            }


            const website =
                safe(req.body.website, 1000);

            const appName =
                safe(req.body.appName, 80);

            const packageName =
                safe(req.body.packageName, 120);


            if (
                !/^https?:\/\//i.test(website)
            ) {

                return res.status(400).json({
                    error:
                        "Website URL must start with http:// or https://"
                });

            }


            if (!appName) {

                return res.status(400).json({
                    error:
                        "App name is required."
                });

            }


            if (!validPackage(packageName)) {

                return res.status(400).json({
                    error:
                        "Invalid Android package name."
                });

            }


            const buildId =
                crypto
                    .randomBytes(16)
                    .toString("hex");


            const folder =
                path.join(
                    DATA_DIR,
                    buildId
                );


            fs.mkdirSync(
                folder,
                {
                    recursive: true
                }
            );


            let iconName = null;


            if (req.file) {

                const ext =
                    path.extname(
                        req.file.originalname
                    ).toLowerCase();


                if (
                    ![
                        ".png",
                        ".jpg",
                        ".jpeg"
                    ].includes(ext)
                ) {

                    return res.status(400).json({
                        error:
                            "Icon must be PNG or JPG."
                    });

                }


                iconName =
                    `icon${ext}`;


                fs.renameSync(
                    req.file.path,
                    path.join(
                        folder,
                        iconName
                    )
                );

            }


            const config = {

                buildId,

                website,

                appName,

                packageName,

                loader:
                    safe(req.body.loader, 30),

                privacyPolicy:
                    safe(
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
                    iconName

            };


            fs.writeFileSync(
                path.join(
                    folder,
                    "config.json"
                ),
                JSON.stringify(
                    config,
                    null,
                    2
                )
            );


            /* TRIGGER GITHUB ACTION */

            const url =
                `https://api.github.com/repos/` +
                `${OWNER}/${REPO}/actions/workflows/` +
                `${WORKFLOW}/dispatches`;


            const response =
                await fetch(
                    url,
                    {
                        method: "POST",

                        headers:
                            githubHeaders(),

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

                const text =
                    await response.text();

                console.error(text);

                return res.status(500).json({
                    error:
                        "GitHub Actions could not be started."
                });

            }


            res.json({

                success: true,

                buildId,

                message:
                    "APK build started."

            });


        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Server error."
            });

        }

    }
);


/* GET BUILD CONFIG */

app.get(
    "/api/build-config/:id",
    (req, res) => {

        const id =
            req.params.id;


        if (
            !/^[a-f0-9]{32}$/i.test(id)
        ) {

            return res.status(400).end();

        }


        const file =
            path.join(
                DATA_DIR,
                id,
                "config.json"
            );


        if (!fs.existsSync(file)) {

            return res.status(404).end();

        }


        res.sendFile(file);

    }
);


/* GET ICON */

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
                DATA_DIR,
                id
            );


        if (!fs.existsSync(folder)) {

            return res.status(404).end();

        }


        const files =
            fs.readdirSync(folder);


        const icon =
            files.find(
                x =>
                    /^icon\.(png|jpg|jpeg)$/i
                        .test(x)
            );


        if (!icon) {

            return res.status(404).end();

        }


        res.sendFile(
            path.join(
                folder,
                icon
            )
        );

    }
);


/* BUILD STATUS */

app.get(
    "/api/build/:id",
    async (req, res) => {

        try {

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


            const url =
                `https://api.github.com/repos/` +
                `${OWNER}/${REPO}/actions/runs` +
                `?event=workflow_dispatch&per_page=20`;


            const response =
                await fetch(
                    url,
                    {
                        headers:
                            githubHeaders()
                    }
                );


            if (!response.ok) {

                return res.status(500).json({
                    error:
                        "Could not check GitHub Actions."
                });

            }


            const data =
                await response.json();


            const run =
                data.workflow_runs.find(
                    r =>
                        r.name &&
                        r.event ===
                        "workflow_dispatch"
                );


            /*
             * GitHub does not expose our build ID
             * directly in the run list here.
             *
             * So look for the artifact instead.
             */

            const artifactsURL =
                `https://api.github.com/repos/` +
                `${OWNER}/${REPO}/actions/artifacts` +
                `?name=appforge-apk-${id}`;


            const artifactResponse =
                await fetch(
                    artifactsURL,
                    {
                        headers:
                            githubHeaders()
                    }
                );


            if (artifactResponse.ok) {

                const artifacts =
                    await artifactResponse.json();


                const artifact =
                    artifacts.artifacts &&
                    artifacts.artifacts[0];


                if (
                    artifact &&
                    !artifact.expired
                ) {

                    return res.json({

                        status:
                            "completed",

                        download:
                            `/api/download/${id}`

                    });

                }

            }


            /*
             * Check recent runs.
             */

            if (run) {

                if (
                    run.status ===
                    "completed"
                ) {

                    if (
                        run.conclusion ===
                        "success"
                    ) {

                        return res.json({
                            status:
                                "completed",

                            download:
                                `/api/download/${id}`
                        });

                    }


                    return res.json({
                        status:
                            "failed"
                    });

                }

            }


            res.json({
                status:
                    "processing"
            });


        } catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    "Status check failed."
            });

        }

    }
);


/* DOWNLOAD APK */

app.get(
    "/api/download/:id",
    async (req, res) => {

        try {

            const id =
                req.params.id;


            if (
                !/^[a-f0-9]{32}$/i.test(id)
            ) {

                return res.status(400).end();

            }


            const artifactURL =
                `https://api.github.com/repos/` +
                `${OWNER}/${REPO}/actions/artifacts` +
                `?name=appforge-apk-${id}`;


            const listResponse =
                await fetch(
                    artifactURL,
                    {
                        headers:
                            githubHeaders()
                    }
                );


            if (!listResponse.ok) {

                return res.status(404).send(
                    "APK not ready."
                );

            }


            const data =
                await listResponse.json();


            const artifact =
                data.artifacts &&
                data.artifacts[0];


            if (
                !artifact ||
                artifact.expired
            ) {

                return res.status(404).send(
                    "APK not ready or expired."
                );

            }


            const downloadURL =
                `https://api.github.com/repos/` +
                `${OWNER}/${REPO}/actions/artifacts/` +
                `${artifact.id}/zip`;


            const zipResponse =
                await fetch(
                    downloadURL,
                    {
                        headers:
                            githubHeaders()
                    }
                );


            if (!zipResponse.ok) {

                return res.status(500).send(
                    "Could not download artifact."
                );

            }


            const arrayBuffer =
                await zipResponse.arrayBuffer();


            const zipPath =
                path.join(
                    DATA_DIR,
                    `${id}.zip`
                );


            fs.writeFileSync(
                zipPath,
                Buffer.from(
                    arrayBuffer
                )
            );


            const zip =
                new AdmZip(zipPath);


            const entries =
                zip.getEntries();


            const apkEntry =
                entries.find(
                    entry =>
                        entry.entryName
                            .toLowerCase()
                            .endsWith(".apk")
                );


            if (!apkEntry) {

                fs.unlinkSync(zipPath);

                return res.status(404).send(
                    "APK file not found."
                );

            }


            const apk =
                apkEntry.getData();


            fs.unlinkSync(zipPath);


            res.setHeader(
                "Content-Type",
                "application/vnd.android.package-archive"
            );


            res.setHeader(
                "Content-Disposition",
                'attachment; filename="app-release.apk"'
            );


            res.send(apk);


        } catch (error) {

            console.error(error);

            res.status(500).send(
                "APK download failed."
            );

        }

    }
);


app.listen(
    PORT,
    () => {

        console.log(
            `AppForge server running on port ${PORT}`
        );

    }
);
