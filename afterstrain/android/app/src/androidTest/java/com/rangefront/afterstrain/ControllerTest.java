package com.rangefront.afterstrain;

import android.app.Instrumentation;
import android.content.Intent;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class ControllerTest {
    private final Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
    private MainActivity activity;

    private String evaluate(String source) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> activity.getBridge().getWebView().evaluateJavascript(source, value -> { result.set(value); latch.countDown(); }));
        assertTrue("WebView evaluation completed", latch.await(15, TimeUnit.SECONDS));
        return result.get();
    }

    private void axis(float horizontal, float vertical, boolean hat) {
        instrumentation.runOnMainSync(() -> {
            MotionEvent.PointerProperties properties = new MotionEvent.PointerProperties();
            properties.id = 0;
            MotionEvent.PointerCoords coordinates = new MotionEvent.PointerCoords();
            coordinates.setAxisValue(hat ? MotionEvent.AXIS_HAT_X : MotionEvent.AXIS_X, horizontal);
            coordinates.setAxisValue(hat ? MotionEvent.AXIS_HAT_Y : MotionEvent.AXIS_Y, vertical);
            long now = SystemClock.uptimeMillis();
            MotionEvent event = MotionEvent.obtain(now, now, MotionEvent.ACTION_MOVE, 1, new MotionEvent.PointerProperties[]{ properties }, new MotionEvent.PointerCoords[]{ coordinates }, 0, 0, 1, 1, 0, 0, InputDevice.SOURCE_JOYSTICK, 0);
            activity.onGenericMotionEvent(event);
            event.recycle();
        });
    }

    @Test public void analogHoldReleaseHatAndDeadzone() throws Exception {
        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(MainActivity.class.getName(), null, false);
        Intent intent = new Intent(instrumentation.getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        instrumentation.getTargetContext().startActivity(intent);
        activity = (MainActivity) monitor.waitForActivityWithTimeout(30000);
        instrumentation.removeMonitor(monitor);
        assertNotNull("Activity launched", activity);
        try {
            for (int attempt = 0; attempt < 120; attempt++) {
                if ("true".equals(evaluate("!!document.querySelector('[data-action=setup]')"))) break;
                SystemClock.sleep(250);
            }
            assertEquals("true", evaluate("!!document.querySelector('[data-action=setup]')"));
            evaluate("document.querySelector('[data-action=setup]').click();document.querySelector('[data-action=start]').click();document.querySelector('[data-action=tab-world]').focus();window.axisMoves=0;document.addEventListener('focusin',()=>window.axisMoves++)");
            axis(0.2f, 0, false);
            SystemClock.sleep(300);
            assertEquals("0", evaluate("window.axisMoves"));
            axis(0.8f, 0, false);
            SystemClock.sleep(800);
            assertEquals("true", evaluate("window.axisMoves>=2"));
            axis(0, 0, false);
            String stopped = evaluate("window.axisMoves");
            SystemClock.sleep(400);
            assertEquals(stopped, evaluate("window.axisMoves"));
            evaluate("document.querySelector('[data-action=tab-lab]').focus();window.axisMoves=0");
            axis(-1, 0, true);
            SystemClock.sleep(150);
            axis(0, 0, true);
            assertEquals("true", evaluate("window.axisMoves>0"));
            axis(0.8f, 0, false);
            instrumentation.runOnMainSync(() -> activity.onInputDeviceRemoved(0));
            stopped = evaluate("window.axisMoves");
            SystemClock.sleep(400);
            assertEquals(stopped, evaluate("window.axisMoves"));
            axis(0.8f, 0, false);
            instrumentation.runOnMainSync(() -> activity.onPause());
            stopped = evaluate("window.axisMoves");
            SystemClock.sleep(400);
            assertEquals(stopped, evaluate("window.axisMoves"));
        } finally {
            axis(0, 0, false);
            instrumentation.runOnMainSync(() -> activity.finish());
        }
    }
}
