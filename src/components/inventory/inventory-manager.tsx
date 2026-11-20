"use client";

import { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Boxes, DollarSign, Loader2, Minus, PackageX, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { addProduct, adjustStock } from "@/app/actions";
import { Pill } from "@/components/badges";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { timeAgo } from "@/lib/ui-tokens";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/commerce";

type InvEvent = { id: string; sku: string; delta: number; reason: string; ref: string | null; actor: string; created_at: string; name: string | null };

const LOW = 5;

export function InventoryManager({ products, events, vectorProducts }: { products: Product[]; events: InvEvent[]; vectorProducts: number | null }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const categories = useMemo(() => [...new Set(products.map((p) => p.category))].sort(), [products]);
  const shown = products.filter(
    (p) => (cat === "all" || p.category === cat) && (!q || `${p.sku} ${p.name} ${p.category}`.toLowerCase().includes(q.toLowerCase())),
  );
  const units = products.reduce((n, p) => n + p.stock, 0);
  const value = products.reduce((n, p) => n + p.stock * p.price, 0);
  const low = products.filter((p) => p.stock > 0 && p.stock < LOW).length;
  const out = products.filter((p) => p.stock === 0).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Products" value={products.length} hint={vectorProducts === null ? "Vector index offline" : `${vectorProducts} in vector index`} icon={Boxes} />
        <StatCard label="Units in stock" value={units.toLocaleString()} icon={Boxes} tone="info" />
        <StatCard label="Stock value" value={`$${Math.round(value).toLocaleString()}`} icon={DollarSign} tone="success" />
        <StatCard label="Low / out of stock" value={`${low} / ${out}`} hint={`Low = under ${LOW} units`} icon={AlertTriangle} tone={out ? "danger" : low ? "warning" : "success"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
        <Card className="min-w-0 py-0">
          <div className="flex flex-wrap items-center gap-2 border-b p-3">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search SKU or name" className="pl-8" />
            </div>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
              aria-label="Category"
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <AddProductDialog categories={categories} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-[11px] tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                  <th className="px-3 py-2 text-center font-medium">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((p) => (
                  <ProductRow key={p.sku} p={p} />
                ))}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                      No products match
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-sm">Recent stock movements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {events.length === 0 && <p className="text-xs text-muted-foreground">No movements yet.</p>}
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-2 text-xs">
                <span className={cn("w-10 shrink-0 text-right font-mono font-semibold tabular-nums", e.delta > 0 ? "text-success" : "text-destructive")}>
                  {e.delta > 0 ? `+${e.delta}` : e.delta}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{e.name ?? e.sku}</span>
                  <span className="block truncate text-muted-foreground">
                    {e.reason}
                    {e.ref ? ` · ${e.ref}` : ""} · {e.actor.replace(/^customer:/, "customer ")} · {timeAgo(e.created_at)}
                  </span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProductRow({ p }: { p: Product }) {
  const [pending, start] = useTransition();
  const change = (delta: number) =>
    start(async () => {
      const res = await adjustStock(p.sku, delta);
      if (!res.ok) toast.error(res.error);
    });
  return (
    <tr className={cn(pending && "opacity-60")}>
      <td className="px-3 py-2">
        <p className="font-medium">{p.name}</p>
        <p className="font-mono text-[10.5px] text-muted-foreground">{p.sku}</p>
      </td>
      <td className="px-3 py-2 text-muted-foreground capitalize">{p.category}</td>
      <td className="px-3 py-2 text-right tabular-nums">${p.price.toFixed(2)}</td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-center gap-1.5">
          <Button size="icon-sm" variant="outline" aria-label={`Decrease ${p.name}`} disabled={pending || p.stock === 0} onClick={() => change(-1)}>
            <Minus />
          </Button>
          <span className="w-10 text-center font-semibold tabular-nums">{pending ? <Loader2 className="mx-auto size-4 animate-spin" /> : p.stock}</span>
          <Button size="icon-sm" variant="outline" aria-label={`Increase ${p.name}`} disabled={pending} onClick={() => change(1)}>
            <Plus />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pending} onClick={() => change(10)}>
            +10
          </Button>
          <span className="w-16">
            {p.stock === 0 ? (
              <Pill tone="danger">
                <PackageX className="size-3" /> Out
              </Pill>
            ) : p.stock < LOW ? (
              <Pill tone="warning">Low</Pill>
            ) : null}
          </span>
        </div>
      </td>
    </tr>
  );
}

function AddProductDialog({ categories }: { categories: string[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ sku: "", name: "", price: "", category: "", stock: "10", description: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await addProduct(form);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Added ${res.id}`, { description: res.note });
      setForm({ sku: "", name: "", price: "", category: "", stock: "10", description: "" });
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> Add product
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Add a product</DialogTitle>
            <DialogDescription>It becomes searchable by the AI agent immediately (embedded into the vector DB).</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" value={form.sku} onChange={set("sku")} placeholder="NB-NEW-ITEM" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Input id="category" value={form.category} onChange={set("category")} list="categories" placeholder="kitchen" required />
              <datalist id="categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={form.name} onChange={set("name")} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="price">Price (USD)</Label>
              <Input id="price" type="number" min="0.01" step="0.01" value={form.price} onChange={set("price")} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stock">Initial stock</Label>
              <Input id="stock" type="number" min="0" step="1" value={form.stock} onChange={set("stock")} required />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={form.description} onChange={set("description")} rows={3} required />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Add product
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
