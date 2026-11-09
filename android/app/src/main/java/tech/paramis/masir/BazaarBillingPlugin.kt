package tech.paramis.masir

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import ir.cafebazaar.poolakey.Connection
import ir.cafebazaar.poolakey.Payment
import ir.cafebazaar.poolakey.config.PaymentConfiguration
import ir.cafebazaar.poolakey.config.SecurityCheck
import ir.cafebazaar.poolakey.entity.PurchaseInfo
import ir.cafebazaar.poolakey.request.PurchaseRequest
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Thin bridge between the web app and Cafe Bazaar in-app billing (Poolakey).
 * The RSA public key comes from BuildConfig (GitHub secret BAZAAR_RSA_KEY at build time).
 */
@CapacitorPlugin(name = "BazaarBilling")
class BazaarBillingPlugin : Plugin() {
    private var payment: Payment? = null
    private var connection: Connection? = null
    @Volatile private var connected = false

    private fun rsaKey(): String = BuildConfig.BAZAAR_RSA.trim()

    @PluginMethod
    fun info(call: PluginCall) {
        val res = JSObject()
        res.put("configured", rsaKey().isNotEmpty())
        res.put("connected", connected)
        call.resolve(res)
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        val key = rsaKey()
        if (key.isEmpty()) { call.reject("not_configured"); return }
        if (connected && payment != null) { call.resolve(); return }
        val done = AtomicBoolean(false)
        activity.runOnUiThread {
            try {
                val p = Payment(context = context, config = PaymentConfiguration(localSecurityCheck = SecurityCheck.Enable(rsaPublicKey = key)))
                payment = p
                connection = p.connect {
                    connectionSucceed { connected = true; if (done.compareAndSet(false, true)) call.resolve() }
                    connectionFailed { t -> connected = false; if (done.compareAndSet(false, true)) call.reject(t.message ?: "connection_failed") }
                    disconnected { connected = false }
                }
            } catch (t: Throwable) {
                if (done.compareAndSet(false, true)) call.reject(t.message ?: "connection_failed")
            }
        }
    }

    @PluginMethod
    fun subscribe(call: PluginCall) {
        val sku = call.getString("sku")
        val p = payment
        if (sku.isNullOrEmpty()) { call.reject("missing_sku"); return }
        if (p == null || !connected) { call.reject("not_connected"); return }
        val payload = call.getString("payload") ?: ""
        val done = AtomicBoolean(false)
        activity.runOnUiThread {
            try {
                p.subscribeProduct(
                    registry = activity.activityResultRegistry,
                    request = PurchaseRequest(productId = sku, payload = payload)
                ) {
                    purchaseFlowBegan { }
                    failedToBeginFlow { t -> if (done.compareAndSet(false, true)) call.reject(t.message ?: "failed_to_begin") }
                    purchaseSucceed { info -> if (done.compareAndSet(false, true)) call.resolve(toJs(info)) }
                    purchaseCanceled { if (done.compareAndSet(false, true)) call.reject("canceled") }
                    purchaseFailed { t -> if (done.compareAndSet(false, true)) call.reject(t.message ?: "purchase_failed") }
                }
            } catch (t: Throwable) {
                if (done.compareAndSet(false, true)) call.reject(t.message ?: "purchase_failed")
            }
        }
    }

    @PluginMethod
    fun subscriptions(call: PluginCall) {
        val p = payment
        if (p == null || !connected) { call.reject("not_connected"); return }
        p.getSubscribedProducts {
            querySucceed { list ->
                val arr = JSArray()
                list.forEach { arr.put(toJs(it)) }
                val res = JSObject(); res.put("list", arr); call.resolve(res)
            }
            queryFailed { t -> call.reject(t.message ?: "query_failed") }
        }
    }

    private fun toJs(info: PurchaseInfo): JSObject {
        val o = JSObject()
        o.put("productId", info.productId)
        o.put("purchaseToken", info.purchaseToken)
        o.put("orderId", info.orderId)
        o.put("purchaseTime", info.purchaseTime)
        o.put("state", info.purchaseState.name)
        o.put("payload", info.payload)
        return o
    }

    override fun handleOnDestroy() {
        try { connection?.disconnect() } catch (_: Throwable) {}
        connected = false
        super.handleOnDestroy()
    }
}
