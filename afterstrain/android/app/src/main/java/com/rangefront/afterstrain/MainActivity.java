package com.rangefront.afterstrain;

import com.getcapacitor.BridgeActivity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.InputDevice;

public class MainActivity extends BridgeActivity {
    private long lastMove = 0;

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
        if (event.getAction() == KeyEvent.ACTION_DOWN && event.getRepeatCount() == 0) sendControl(command);
        return true;
    }

    @Override
    public boolean onGenericMotionEvent(MotionEvent event) {
        if ((event.getSource() & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK) {
            long now = android.os.SystemClock.uptimeMillis();
            if (now - lastMove > 180) {
                float horizontal = event.getAxisValue(MotionEvent.AXIS_X);
                float vertical = event.getAxisValue(MotionEvent.AXIS_Y);
                String command = vertical < -0.55 ? "up" : vertical > 0.55 ? "down" : horizontal < -0.55 ? "left" : horizontal > 0.55 ? "right" : null;
                if (command != null) { sendControl(command); lastMove = now; }
            }
            return true;
        }
        return super.onGenericMotionEvent(event);
    }
}
