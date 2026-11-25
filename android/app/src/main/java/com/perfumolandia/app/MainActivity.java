package com.perfumolandia.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ScreenSharePlugin.class);
        registerPlugin(PushPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onResume() {
        super.onResume();
        CallMessagingService.foreground = true;
    }

    @Override
    public void onPause() {
        CallMessagingService.foreground = false;
        super.onPause();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent); // ligação tocada com o app já aberto em segundo plano
    }
}
