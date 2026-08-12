package com.appforge.template;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {

    private WebView webView;
    private ProgressBar progressBar;

    // server.js build ke waqt is URL ko replace karega
    private static final String WEBSITE_URL =
            "__WEBSITE_URL__";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {

        super.onCreate(savedInstanceState);

        setContentView(R.layout.activity_main);

        webView =
                findViewById(R.id.webView);

        progressBar =
                findViewById(R.id.progressBar);

        WebSettings settings =
                webView.getSettings();

        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);

        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);

        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        settings.setSupportZoom(false);

        webView.setBackgroundColor(
                Color.WHITE
        );

        webView.setWebViewClient(
                new WebViewClient() {

                    @Override
                    public boolean shouldOverrideUrlLoading(
                            WebView view,
                            WebResourceRequest request
                    ) {

                        String url =
                                request
                                        .getUrl()
                                        .toString();

                        /*
                         * Normal HTTP/HTTPS links
                         * app ke andar open honge.
                         */

                        if (
                                url.startsWith("http://") ||
                                url.startsWith("https://")
                        ) {

                            return false;

                        }

                        /*
                         * Other links Android ke
                         * external apps mein kholne
                         * ki koshish karenge.
                         */

                        try {

                            Intent intent =
                                    new Intent(
                                            Intent.ACTION_VIEW,
                                            Uri.parse(url)
                                    );

                            startActivity(intent);

                        } catch (Exception ignored) {}

                        return true;
                    }
                }
        );


        webView.setWebChromeClient(
                new WebChromeClient() {

                    @Override
                    public void onProgressChanged(
                            WebView view,
                            int newProgress
                    ) {

                        progressBar.setProgress(
                                newProgress
                        );

                        if (newProgress >= 100) {

                            progressBar.setVisibility(
                                    View.GONE
                            );

                        } else {

                            progressBar.setVisibility(
                                    View.VISIBLE
                            );

                        }
                    }
                }
        );


        /*
         * Website load karo.
         */

        webView.loadUrl(
                WEBSITE_URL
        );


        /*
         * Android back button.
         */

        getOnBackPressedDispatcher()
                .addCallback(
                        this,
                        new OnBackPressedCallback(true) {

                            @Override
                            public void handleOnBackPressed() {

                                if (
                                        webView.canGoBack()
                                ) {

                                    webView.goBack();

                                } else {

                                    finish();

                                }
                            }
                        }
                );
    }


    @Override
    protected void onDestroy() {

        if (webView != null) {

            webView.stopLoading();
            webView.destroy();

        }

        super.onDestroy();
    }
}
