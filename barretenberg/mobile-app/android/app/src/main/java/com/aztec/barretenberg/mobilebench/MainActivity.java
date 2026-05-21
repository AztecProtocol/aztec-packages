package com.aztec.barretenberg.mobilebench;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class MainActivity extends Activity {
    static {
        System.loadLibrary("bbmobilebench");
    }

    private static native String nativeStatus();
    private static native int nativeAbiVersion();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setGravity(Gravity.CENTER);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(48, 48, 48, 48);

        TextView title = new TextView(this);
        title.setText("Barretenberg Mobile Bench");
        title.setTextSize(24);

        TextView status = new TextView(this);
        status.setText(nativeStatus() + " (ABI " + nativeAbiVersion() + ")");
        status.setTextSize(16);

        root.addView(title);
        root.addView(status);
        setContentView(root);
    }
}
