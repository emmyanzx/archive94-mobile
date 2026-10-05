import { useCallback, useEffect, useState } from "react";
import { Alert, AppState, FlatList, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";

WebBrowser.maybeCompleteAuthSession();
const API = process.env.EXPO_PUBLIC_API_URL!;
const C = { paper: "#E4E8E9", ink: "#121A22", denim: "#2F4A66", tag: "#E6C230" };
type P = { id: string; catalog_no: number; name: string; price: number; stock: number; era: string | null; size: string | null };
const naira = (n: number) => "₦" + n.toLocaleString("en-NG");
const input = { borderWidth: 2, borderColor: C.ink, minHeight: 44, paddingHorizontal: 12, color: C.ink, marginTop: 8 };
const Btn = ({ label, onPress, solid = true }: { label: string; onPress: () => void; solid?: boolean }) => (
  <Pressable onPress={onPress} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 16, justifyContent: "center", borderWidth: 2, borderColor: C.ink, backgroundColor: solid ? C.ink : "transparent", marginTop: 8 }}>
    <Text style={{ color: solid ? C.paper : C.ink, fontWeight: "700", textAlign: "center" }}>{label}</Text>
  </Pressable>
);

export default function App() {
  const [tab, setTab] = useState<"shop" | "cart" | "account">("shop");
  const [session, setSession] = useState<Session | null>(null);
  const [products, setProducts] = useState<P[]>([]);
  const [cart, setCart] = useState<string[]>([]);
  const [f, setF] = useState({ name: "", phone: "", address: "" });
  const uid = session?.user.id;

  const loadProducts = useCallback(async () => {
    const { data } = await supabase.from("products").select("id,catalog_no,name,price,stock,era,size").order("created_at", { ascending: false });
    setProducts((data as P[]) ?? []);
  }, []);
  const loadCart = useCallback(async () => {
    const { data } = await supabase.from("cart_items").select("product_id");
    setCart((data ?? []).map((r) => r.product_id as string));
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    loadProducts();
    return () => sub.subscription.unsubscribe();
  }, [loadProducts]);

  useEffect(() => {
    if (!uid) { setCart([]); return; }
    loadCart();
    const ch = supabase.channel("cart-" + uid)
      .on("postgres_changes", { event: "*", schema: "public", table: "cart_items", filter: `user_id=eq.${uid}` }, () => loadCart())
      .subscribe();
    const app = AppState.addEventListener("change", (s) => { if (s === "active") { loadCart(); loadProducts(); } });
    return () => { supabase.removeChannel(ch); app.remove(); };
  }, [uid, loadCart, loadProducts]);

  async function signIn() {
    const redirectTo = Linking.createURL("auth");
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo, skipBrowserRedirect: true } });
    if (error || !data.url) return Alert.alert("Sign in failed", error?.message);
    const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (res.type !== "success") return;
    const p = new URLSearchParams(res.url.split("#")[1] ?? res.url.split("?")[1] ?? "");
    const at = p.get("access_token"), rt = p.get("refresh_token");
    if (at && rt) await supabase.auth.setSession({ access_token: at, refresh_token: rt });
    else Alert.alert("Sign in failed", "No session returned. Check the redirect URLs in Supabase.");
  }
  async function toggle(id: string) {
    if (!session) { setTab("account"); return Alert.alert("Sign in first", "Sign in to use your cart."); }
    const r = cart.includes(id) ? await supabase.from("cart_items").delete().eq("product_id", id) : await supabase.from("cart_items").insert({ product_id: id });
    if (r.error) Alert.alert("Cart error", r.error.message);
    loadCart();
  }
  const items = products.filter((p) => cart.includes(p.id) && p.stock > 0);
  const total = items.reduce((s, p) => s + p.price, 0);
  async function checkout(method: "paystack" | "cod") {
    if (!f.name || !f.phone || !f.address) return Alert.alert("Missing details", "Fill in name, phone and address.");
    const r = await fetch(`${API}/api/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session!.access_token}` },
      body: JSON.stringify({ ids: items.map((i) => i.id), ...f, method }),
    });
    const j = await r.json();
    if (!r.ok) return Alert.alert("Could not order", j.error);
    if (j.url) await WebBrowser.openBrowserAsync(j.url); else Alert.alert("Order placed", j.number);
    loadCart(); loadProducts();
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.paper }}>
      <View style={{ padding: 16, borderBottomWidth: 2, borderColor: C.ink }}><Text style={{ fontSize: 24, fontWeight: "900", color: C.ink }}>Archive94</Text></View>
      <View style={{ flex: 1 }}>
        {tab === "shop" && (
          <FlatList data={products} keyExtractor={(p) => p.id} renderItem={({ item }) => (
            <View style={{ margin: 12, marginBottom: 0 }}>
              <View style={{ backgroundColor: C.denim, height: 140, justifyContent: "flex-end", padding: 12 }}>
                <Text style={{ color: C.paper, fontSize: 36, fontWeight: "900" }}>{`094-${String(item.catalog_no).padStart(3, "0")}`}</Text>
              </View>
              <Text style={{ fontWeight: "700", fontSize: 16, marginTop: 6, color: C.ink }}>{item.name}</Text>
              <Text style={{ color: C.ink }}>{item.era}, size {item.size}</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontWeight: "700", color: C.ink }}>{naira(item.price)}</Text>
                {item.stock > 0 ? <Btn label={cart.includes(item.id) ? "In your cart" : "Add to cart"} solid={cart.includes(item.id)} onPress={() => toggle(item.id)} /> : <Text style={{ fontWeight: "700" }}>Archived</Text>}
              </View>
            </View>)} />
        )}
        {tab === "cart" && (
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            {!session ? <><Text style={{ color: C.ink }}>Sign in to see your cart.</Text><Btn label="Continue with Google" onPress={signIn} /></>
              : !items.length ? <Text style={{ color: C.ink }}>Your cart is empty.</Text>
              : <>
                {items.map((p) => <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 }}><Text style={{ color: C.ink, flex: 1 }}>{p.name} ({p.size})</Text><Text style={{ color: C.ink, fontWeight: "700" }}>{naira(p.price)}</Text></View>)}
                <Text style={{ fontWeight: "900", fontSize: 18, color: C.ink }}>Total {naira(total)}</Text>
                <TextInput style={input} placeholder="Full name" placeholderTextColor="#555" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
                <TextInput style={input} placeholder="Phone number" placeholderTextColor="#555" keyboardType="phone-pad" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} />
                <TextInput style={[input, { minHeight: 80 }]} multiline placeholder="Delivery address" placeholderTextColor="#555" value={f.address} onChangeText={(v) => setF({ ...f, address: v })} />
                <Btn label="Pay online (Paystack)" onPress={() => checkout("paystack")} />
                <Btn label="Pay on delivery" solid={false} onPress={() => checkout("cod")} />
              </>}
          </ScrollView>
        )}
        {tab === "account" && (
          <View style={{ padding: 16 }}>
            {session ? <><Text style={{ color: C.ink }}>Signed in as {session.user.email}</Text><Btn label="Sign out" onPress={() => supabase.auth.signOut()} /></>
              : <><Text style={{ color: C.ink }}>Use the same Google account as the website.</Text><Btn label="Continue with Google" onPress={signIn} /></>}
          </View>
        )}
      </View>
      <View style={{ flexDirection: "row", borderTopWidth: 2, borderColor: C.ink }}>
        {(["shop", "cart", "account"] as const).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={{ flex: 1, minHeight: 52, justifyContent: "center", backgroundColor: tab === t ? C.tag : "transparent" }}>
            <Text style={{ textAlign: "center", fontWeight: "700", color: C.ink }}>{t === "cart" ? `Cart (${items.length})` : t[0].toUpperCase() + t.slice(1)}</Text>
          </Pressable>))}
      </View>
    </SafeAreaView>
  );
}
