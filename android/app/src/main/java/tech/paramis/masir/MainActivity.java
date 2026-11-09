package tech.paramis.masir;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BazaarBillingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
