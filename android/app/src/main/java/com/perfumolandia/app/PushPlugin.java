package com.perfumolandia.app;

import android.Manifest;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

/** Pede permissão de notificação e devolve o token do Firebase para o servidor mandar as ligações. */
@CapacitorPlugin(name = "CallPush", permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public class PushPlugin extends Plugin {

    @PluginMethod
    public void register(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterPermission");
            return;
        }
        fetchToken(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        if (getPermissionState("notifications") != PermissionState.GRANTED) {
            call.reject("sem permissão de notificação");
            return;
        }
        fetchToken(call);
    }

    private void fetchToken(PluginCall call) {
        try {
            if (FirebaseApp.getApps(getContext()).isEmpty()) FirebaseApp.initializeApp(getContext());
            if (FirebaseApp.getApps(getContext()).isEmpty()) { call.reject("firebase não configurado"); return; }
            FirebaseMessaging.getInstance().getToken().addOnCompleteListener(t -> {
                if (!t.isSuccessful() || t.getResult() == null) { call.reject("sem token"); return; }
                JSObject r = new JSObject();
                r.put("token", t.getResult());
                call.resolve(r);
            });
        } catch (Exception e) {
            call.reject("firebase não configurado");
        }
    }

    /** dm da ligação que abriu o app (tocou na notificação) */
    @PluginMethod
    public void openedFrom(PluginCall call) {
        JSObject r = new JSObject();
        String dm = getActivity() != null && getActivity().getIntent() != null ? getActivity().getIntent().getStringExtra("callDm") : null;
        if (dm != null) { r.put("dmId", dm); getActivity().getIntent().removeExtra("callDm"); }
        call.resolve(r);
    }
}
