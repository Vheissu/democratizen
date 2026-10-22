package com.rangefront.afterstrain;

import com.getcapacitor.BridgeActivity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.InputDevice;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.hardware.input.InputManager;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity implements InputManager.InputDeviceListener {
    private long lastMove = 0;
    private final Handler controllerHandler = new Handler(Looper.getMainLooper());
    private String heldDirection;
    private final Runnable repeatDirection = new Runnable() {
        @Override public void run() {
            if (heldDirection != null) {
                sendControl(heldDirection);
                controllerHandler.postDelayed(this, 180);
            }
        }
    };

    @Override
    public void onPause() {
        heldDirection = null;
        controllerHandler.removeCallbacks(repeatDirection);
        super.onPause();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ((InputManager) getSystemService(INPUT_SERVICE)).registerInputDeviceListener(this, controllerHandler);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { sendControl("back"); }
        });
    }

    @Override public void onInputDeviceAdded(int deviceId) {}
    @Override public void onInputDeviceChanged(int deviceId) {}
    @Override public void onInputDeviceRemoved(int deviceId) {
        heldDirection = null;
        controllerHandler.removeCallbacks(repeatDirection);
    }
    @Override public void onDestroy() {
        ((InputManager) getSystemService(INPUT_SERVICE)).unregisterInputDeviceListener(this);
        controllerHandler.removeCallbacks(repeatDirection);
        super.onDestroy();
    }

    private void sendControl(String command) {
        if (getBridge() != null) {
            getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('afterstrain-control',{detail:'" + command + "'}))", null);
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        String command;
        switch (event.getKeyCode()) {
            case KeyEvent.KEYCODE_DPAD_UP: command = "up"; break;
            case KeyEvent.KEYCODE_DPAD_DOWN: command = "down"; break;
            case KeyEvent.KEYCODE_DPAD_LEFT: command = "left"; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: command = "right"; break;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_BUTTON_A: command = "select"; break;
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_BUTTON_B: command = "back"; break;
            case KeyEvent.KEYCODE_BUTTON_START:
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: command = "pause"; break;
            case KeyEvent.KEYCODE_BUTTON_L1: command = "region-prev"; break;
            case KeyEvent.KEYCODE_BUTTON_R1: command = "region-next"; break;
            default: return super.dispatchKeyEvent(event);
        }
        if (event.getAction() == KeyEvent.ACTION_DOWN) {
            boolean direction = command.equals("up") || command.equals("down") || command.equals("left") || command.equals("right");
            long now = android.os.SystemClock.uptimeMillis();
            if (event.getRepeatCount() == 0 || (direction && now - lastMove >= 160)) {
                sendControl(command);
                if (direction) lastMove = now;
            }
        }
        return true;
    }

    @Override
    public boolean onGenericMotionEvent(MotionEvent event) {
        if ((event.getSource() & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK) {
                float horizontal = event.getAxisValue(MotionEvent.AXIS_X);
                float vertical = event.getAxisValue(MotionEvent.AXIS_Y);
                if (Math.abs(horizontal) < 0.55) horizontal = event.getAxisValue(MotionEvent.AXIS_HAT_X);
                if (Math.abs(vertical) < 0.55) vertical = event.getAxisValue(MotionEvent.AXIS_HAT_Y);
                String command = vertical < -0.55 ? "up" : vertical > 0.55 ? "down" : horizontal < -0.55 ? "left" : horizontal > 0.55 ? "right" : null;
                if (command == null) {
                    heldDirection = null;
                    controllerHandler.removeCallbacks(repeatDirection);
                } else if (!command.equals(heldDirection)) {
                    heldDirection = command;
                    controllerHandler.removeCallbacks(repeatDirection);
                    sendControl(command);
                    controllerHandler.postDelayed(repeatDirection, 300);
                }
            return true;
        }
        return super.onGenericMotionEvent(event);
    }
}
