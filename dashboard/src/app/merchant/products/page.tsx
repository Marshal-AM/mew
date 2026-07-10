"use client";

import { useCallback, useEffect, useState } from "react";
import { DEMO_MERCHANT_ID } from "@/lib/demo-merchant";
import { getAuthenticatedClient } from "@/lib/supabase-client";
import { ProductSlotGrid } from "@/components/ProductSlotGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type Product = {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  pos_slot: number | null;
  active: boolean;
};

const emptyForm = {
  id: "",
  name: "",
  sku: "",
  price: "",
  pos_slot: "",
  active: true,
};

export default function MerchantProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const supabase = getAuthenticatedClient();
    if (!supabase) return;
    const { data, error } = await supabase
      .from("products")
      .select("id,name,sku,price,pos_slot,active")
      .eq("merchant_id", DEMO_MERCHANT_ID)
      .order("pos_slot", { ascending: true, nullsFirst: false });
    if (error) {
      setStatus(error.message);
      return;
    }
    setProducts((data as Product[]) ?? []);
    setStatus(`${data?.length ?? 0} product(s)`);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => setForm(emptyForm);

  const editProduct = (p: Product) => {
    setForm({
      id: p.id,
      name: p.name,
      sku: p.sku ?? "",
      price: String(p.price),
      pos_slot: p.pos_slot != null ? String(p.pos_slot) : "",
      active: p.active,
    });
  };

  const validate = (): string | null => {
    if (!form.name.trim()) return "Name is required";
    if (form.name.length > 24) return "Name should be 24 characters or fewer for POS display";
    if (form.pos_slot) {
      const slot = Number(form.pos_slot);
      if (!Number.isInteger(slot) || slot < 1 || slot > 9) return "POS key must be 1–9";
      const conflict = products.find(
        (p) => p.active && p.pos_slot === slot && p.id !== form.id,
      );
      if (conflict) return `POS key ${slot} is already assigned to "${conflict.name}"`;
    }
    return null;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setStatus(err);
      return;
    }
    const supabase = getAuthenticatedClient();
    if (!supabase) return;
    setSaving(true);
    const row = {
      ...(form.id ? { id: form.id } : {}),
      merchant_id: DEMO_MERCHANT_ID,
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      price: form.price ? Number(form.price) : 0,
      pos_slot: form.pos_slot ? Number(form.pos_slot) : null,
      active: form.active,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("products").upsert(row);
    setSaving(false);
    if (error) {
      setStatus(error.message);
      return;
    }
    setStatus("Saved. POS picks up changes on next catalog sync / reboot.");
    resetForm();
    await load();
  };

  const deactivate = async (id: string) => {
    const supabase = getAuthenticatedClient();
    if (!supabase) return;
    const { error } = await supabase.from("products").update({ active: false }).eq("id", id);
    if (error) setStatus(error.message);
    else await load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">POS Product Catalog</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Keys 1–9 on POS-001 map to <code className="text-xs">pos_slot</code>. Wallet / QR unchanged.
          POS syncs on boot (~30s retry).
        </p>
        {status ? <p className="text-sm mt-2">{status}</p> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Keypad slot map</CardTitle>
          <CardDescription>What cashiers see when pressing 1–9</CardDescription>
        </CardHeader>
        <CardContent>
          <ProductSlotGrid products={products} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{form.id ? "Edit product" : "Add product"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-4 md:grid-cols-2 max-w-2xl">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={24}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="price">Reference price (MOO)</Label>
              <Input
                id="price"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>POS key (1–9)</Label>
              <Select
                value={form.pos_slot || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, pos_slot: v === "none" ? "" : v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select key" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (dashboard only)</SelectItem>
                  {Array.from({ length: 9 }, (_, i) => String(i + 1)).map((n) => (
                    <SelectItem key={n} value={n}>
                      Key {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 flex items-end gap-2 md:col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
                Active on POS
              </label>
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save product"}
              </Button>
              {form.id ? (
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All products</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>POS key</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Ref price</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.pos_slot ?? "—"}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>{p.sku ?? "—"}</TableCell>
                  <TableCell>{Number(p.price).toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={p.active ? "success" : "secondary"}>
                      {p.active ? "yes" : "no"}
                    </Badge>
                  </TableCell>
                  <TableCell className="space-x-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => editProduct(p)}>
                      Edit
                    </Button>
                    {p.active ? (
                      <Button type="button" size="sm" variant="destructive" onClick={() => void deactivate(p.id)}>
                        Deactivate
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
