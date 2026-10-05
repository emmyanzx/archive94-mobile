import { useCallback, useEffect, useState } from "react";
import { Alert, AppState, Dimensions, FlatList, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";

WebBrowser.maybeCompleteAuthSession();
const API = process.env.EXPO_PUBLIC_API_URL!;
const C = { paper: "#E4E8E9", ink: "#121A22", denim: "#2F4A66", tag: "#E6C230" };
type P = { id: string; catalog_no: number; name: string; price: number; stock: number; era: string | null; size: string | null; images: string[] | null };
type Full = P & { description: string | null; category: string | null; condition: string | null; measurements: Record<string, number> | null };
const naira = (n: number) => "₦" + n.toLocaleString("en-NG");
const { width: SCREEN_W } = Dimensions.get("window");
const STEPS = [["Sourced", "Every piece is picked by hand, from the 70s through the 2000s."], ["Graded", "Condition is marked Excellent, Good or Fair, with notes on the product page."], ["Measured", "Flat measurements in cm on every piece, so you can check the fit before you buy."], ["One of one", "There is only one of each. When it sells, it goes in the archive."]];
const GRADES = [["Excellent", "Little to no wear."], ["Good", "Normal signs of age that suit the piece."], ["Fair", "Visible wear, always described on the page."]];
const input = { borderWidth: 2, borderColor: C.ink, minHeight: 44, paddingHorizontal: 12, color: C.ink, marginTop: 8 };
const Btn = ({ label, onPress, solid = true }: { label: string; onPress: () => void; solid?: boolean }) => (
  <Pressable onPress={onPress} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 16, justifyContent: "center", borderWidth: 2, borderColor: C.ink, backgroundColor: solid ? C.ink : "transparent", marginTop: 8 }}>
    <Text style={{ color: solid ? C.paper : C.ink, fontWeight: "700", textAlign: "center" }}>{label}</Text>
  </Pressable>
);

function Main() {
  const [tab, setTab] = useState<"shop" | "cart" | "about" | "account">("shop");
  const [sel, setSel] = useState<Full | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [products, setProducts] = useState<P[]>([]);
  const [cart, setCart] = useState<string[]>([]);
  const [f, setF] = useState({ name: "", phone: "", address: "" });
  const uid = session?.user.id;

  const loadProducts = useCallback(async () => {
    const { data } = await supabase.from("products").select("id,catalog_no,name,price,stock,era,size,images").order("created_at", { ascending: false });
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

  async function openItem(id: string) {
    const { data } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
    if (data) setSel(data as Full);
  }
  async function signIn() {
    const appUrl = Linking.createURL("auth");
    const redirectTo = `${API}/mobile-auth?app=${encodeURIComponent(appUrl)}`;
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo, skipBrowserRedirect: true } });
    if (error || !data.url) return Alert.alert("Sign in failed", error?.message);
    const res = await WebBrowser.openAuthSessionAsync(data.url, appUrl);
    if (res.type !== "success") return;
    const p = new URLSearchParams(res.url.split("#")[1] ?? res.url.split("?")[1] ?? "");
    const at = p.get("access_token"), rt = p.get("refresh_token");
    if (at && rt) await supabase.auth.setSession({ access_token: at, refresh_token: rt });
    else Alert.alert("Sign in failed", "No session returned. Check the redirect URLs in Supabase.");
  }
  async function toggle(id: string) {
    if (!session) { setSel(null); setTab("account"); return Alert.alert("Sign in first", "Sign in to use your cart."); }
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
        {sel && (
          <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.paper, zIndex: 10 }}>
            <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
              <Pressable onPress={() => setSel(null)} accessibilityRole="button" style={{ padding: 16, minHeight: 44, justifyContent: "center" }}>
                <Text style={{ fontWeight: "700", color: C.ink, textDecorationLine: "underline" }}>Back to the archive</Text>
              </Pressable>
              {sel.images?.length ? (
                <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
                  {sel.images.map((u) => <Image key={u} source={{ uri: u }} resizeMode="cover" style={{ width: SCREEN_W, aspectRatio: 4 / 5 }} />)}
                </ScrollView>
              ) : (
                <View style={{ aspectRatio: 4 / 5, backgroundColor: C.denim, justifyContent: "flex-end", padding: 16 }}>
                  <Text style={{ color: C.paper, fontSize: 56, fontWeight: "900" }}>{`094-${String(sel.catalog_no).padStart(3, "0")}`}</Text>
                </View>
              )}
              <View style={{ padding: 16 }}>
                <Text style={{ fontWeight: "700", color: C.ink }}>{`No. 094-${String(sel.catalog_no).padStart(3, "0")}`}</Text>
                <Text style={{ fontSize: 28, fontWeight: "900", color: C.ink }}>{sel.name}</Text>
                <Text style={{ fontSize: 22, fontWeight: "700", color: C.ink, marginTop: 8 }}>{naira(sel.price)}</Text>
                {sel.description ? <Text style={{ color: C.ink, marginTop: 12, fontSize: 16 }}>{sel.description}</Text> : null}
                <View style={{ marginTop: 12 }}>
                  {[["Era", sel.era], ["Size", sel.size], ["Condition", sel.condition], ["Category", sel.category]].map(([k, v]) => v ? (
                    <View key={k as string} style={{ flexDirection: "row", paddingVertical: 8, borderTopWidth: 1, borderColor: C.ink }}>
                      <Text style={{ width: 110, fontWeight: "700", color: C.ink }}>{k}</Text><Text style={{ color: C.ink }}>{v}</Text>
                    </View>) : null)}
                </View>
                {sel.measurements && Object.keys(sel.measurements).length > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={{ fontWeight: "900", color: C.ink, marginBottom: 4 }}>Measurements (flat, cm)</Text>
                    {Object.entries(sel.measurements).map(([k, v]) => (
                      <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1, borderColor: C.ink }}>
                        <Text style={{ color: C.ink, textTransform: "capitalize" }}>{k.replace("_cm", "").replace("_", " ")}</Text><Text style={{ fontWeight: "700", color: C.ink }}>{v}</Text>
                      </View>))}
                  </View>
                )}
                {sel.stock > 0
                  ? <Btn label={cart.includes(sel.id) ? "In your cart" : "Add to cart"} solid={cart.includes(sel.id)} onPress={() => toggle(sel.id)} />
                  : <Text style={{ fontWeight: "700", marginTop: 16, color: C.ink }}>Archived. This piece has sold.</Text>}
              </View>
            </ScrollView>
          </View>
        )}
        {tab === "shop" && (
          <FlatList data={products} keyExtractor={(p) => p.id} numColumns={2}
            contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
            columnWrapperStyle={{ gap: 12 }}
            ListHeaderComponent={<Text style={{ fontSize: 26, fontWeight: "900", color: C.ink, marginBottom: 12, lineHeight: 28 }}>One of one. Then it’s archived.</Text>}
            renderItem={({ item }) => {
              const no = `094-${String(item.catalog_no).padStart(3, "0")}`;
              const photo = item.images?.[0];
              const inCart = cart.includes(item.id);
              const badge = { position: "absolute" as const, top: 8, paddingHorizontal: 6, paddingVertical: 2, fontWeight: "700" as const, fontSize: 12 };
              return (
                <Pressable style={{ flex: 0.5, marginBottom: 16 }} onPress={() => openItem(item.id)}>
                  <View style={{ aspectRatio: 4 / 5, backgroundColor: C.denim, justifyContent: "flex-end", overflow: "hidden" }}>
                    {photo ? <Image source={{ uri: photo }} resizeMode="cover" style={{ position: "absolute", width: "100%", height: "100%" }} /> : null}
                    <Text style={photo ? { ...badge, left: 8, backgroundColor: C.ink, color: C.paper } : { color: C.paper, fontSize: 28, fontWeight: "900", padding: 10 }}>{no}</Text>
                    {item.stock === 0 && <Text style={{ ...badge, right: 8, backgroundColor: C.tag, color: C.ink }}>Archived</Text>}
                  </View>
                  <Text numberOfLines={2} style={{ fontWeight: "700", fontSize: 15, marginTop: 6, color: C.ink }}>{item.name}</Text>
                  <Text style={{ color: C.ink, fontSize: 13 }}>{item.era}, size {item.size}</Text>
                  <Text style={{ fontWeight: "700", color: C.ink, marginTop: 2 }}>{naira(item.price)}</Text>
                  {item.stock > 0 && <Btn label={inCart ? "In your cart" : "Add to cart"} solid={inCart} onPress={() => toggle(item.id)} />}
                </Pressable>
              );
            }} />
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
        {tab === "about" && (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
            <Text style={{ fontSize: 32, fontWeight: "900", color: C.ink, lineHeight: 34 }}>Archive94 is a vintage menswear archive.</Text>
            <Text style={{ color: C.ink, marginTop: 12, fontSize: 16 }}>We collect clothes that were made to last and give them a second life. Each one gets a catalog number, an honest grade and real measurements.</Text>
            <Text style={{ fontSize: 20, fontWeight: "900", color: C.ink, marginTop: 24 }}>How it works</Text>
            {STEPS.map(([h, d], i) => (
              <View key={h} style={{ borderWidth: 2, borderColor: C.ink, padding: 12, marginTop: 10 }}>
                <Text style={{ fontSize: 28, fontWeight: "900", color: C.denim }}>{String(i + 1).padStart(2, "0")}</Text>
                <Text style={{ fontWeight: "700", color: C.ink }}>{h}</Text><Text style={{ color: C.ink }}>{d}</Text>
              </View>))}
            <Text style={{ fontSize: 20, fontWeight: "900", color: C.ink, marginTop: 24 }}>Condition guide</Text>
            {GRADES.map(([g, d]) => (
              <View key={g} style={{ flexDirection: "row", paddingVertical: 8, borderTopWidth: 1, borderColor: C.ink }}>
                <Text style={{ width: 90, fontWeight: "700", color: C.ink }}>{g}</Text><Text style={{ color: C.ink, flex: 1 }}>{d}</Text>
              </View>))}
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
        {(["shop", "cart", "about", "account"] as const).map((t) => (
          <Pressable key={t} onPress={() => { setSel(null); setTab(t); }} style={{ flex: 1, minHeight: 52, justifyContent: "center", backgroundColor: tab === t ? C.tag : "transparent" }}>
            <Text style={{ textAlign: "center", fontWeight: "700", color: C.ink }}>{t === "cart" ? `Cart (${items.length})` : t[0].toUpperCase() + t.slice(1)}</Text>
          </Pressable>))}
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return <SafeAreaProvider><Main /></SafeAreaProvider>;
}
