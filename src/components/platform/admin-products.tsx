"use client";

import Image from "next/image";
import { useState } from "react";
import { HiArrowUpTray, HiPhoto } from "react-icons/hi2";
import { BreadAmount } from "@/components/shared/bread-amount";
import {
  addProduct,
  deleteProduct,
  toggleProduct,
  updateProduct,
} from "@/actions/shop";
import { createProductImageUpload } from "@/actions/uploads";

type ProductFormState = {
  name: string;
  description: string;
  imageUrl: string;
  price: number;
  stock: number | null;
  active: boolean;
};

const emptyProduct: ProductFormState = {
  name: "",
  description: "",
  imageUrl: "",
  price: 1,
  stock: null,
  active: true,
};

function ProductFields({
  value,
  onChange,
}: {
  value: ProductFormState;
  onChange: (value: ProductFormState) => void;
}) {
  const [uploading, setUploading] = useState(false);

  const uploadImage = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const { uploadUrl, publicUrl } = await createProductImageUpload(
        file.type,
      );
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!res.ok) throw new Error("Upload failed. Try again.");
      onChange({ ...value, imageUrl: publicUrl });
    } catch (error) {
      alert(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-black/60">Name</span>
        <input
          type="text"
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          className="rounded-[10px] border border-black bg-white px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-[#BD0F32]/20"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-black/60">Price</span>
        <input
          type="number"
          value={value.price}
          min={1}
          onChange={(event) =>
            onChange({ ...value, price: Number(event.target.value) })
          }
          className="rounded-[10px] border border-black bg-white px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-[#BD0F32]/20"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-black/60">Stock</span>
        <input
          type="number"
          value={value.stock ?? ""}
          min={0}
          placeholder="Unlimited"
          onChange={(event) =>
            onChange({
              ...value,
              stock:
                event.target.value === "" ? null : Number(event.target.value),
            })
          }
          className="rounded-[10px] border border-black bg-white px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-[#BD0F32]/20"
        />
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="text-xs font-bold text-black/60">Product image</span>
        <input type="hidden" name="imageUrl" value={value.imageUrl} readOnly />
        {value.imageUrl ? (
          <div className="flex items-center gap-4">
            <div className="relative size-28 shrink-0 overflow-hidden rounded-[12px] border border-black bg-[#f4f4f4]">
              <Image
                src={value.imageUrl}
                alt="Product preview"
                fill
                sizes="112px"
                className="object-contain p-3"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-black/45">
                {value.imageUrl}
              </p>
              <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded border border-black bg-white px-3 py-1.5 text-xs font-semibold transition hover:bg-black hover:text-white">
                <HiArrowUpTray className="size-3.5" />
                {uploading ? "Uploading..." : "Replace image"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading}
                  onChange={(event) =>
                    void uploadImage(event.target.files?.[0] ?? null)
                  }
                  className="sr-only"
                />
              </label>
            </div>
          </div>
        ) : (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-[12px] border-2 border-dashed border-black/25 bg-[#f4f4f4] px-4 py-6 transition hover:border-[#BD0F32] hover:bg-[#fff5f7]">
            <div className="grid size-12 place-items-center rounded-full border border-black/30 bg-white">
              <HiPhoto className="size-6 text-black/30" />
            </div>
            <span className="text-sm font-black text-black/50">
              {uploading ? "Uploading..." : "Upload product image"}
            </span>
            <span className="text-xs font-semibold text-black/35">
              PNG, JPEG, or WebP
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={uploading}
              onChange={(event) =>
                void uploadImage(event.target.files?.[0] ?? null)
              }
              className="sr-only"
            />
          </label>
        )}
      </label>
      <label className="flex flex-col gap-1 sm:col-span-2">
        <span className="text-xs font-bold text-black/60">Description</span>
        <textarea
          value={value.description}
          onChange={(event) =>
            onChange({ ...value, description: event.target.value })
          }
          rows={3}
          className="rounded-[10px] border border-black bg-white px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-[#BD0F32]/20"
        />
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold text-black">
        <input
          type="checkbox"
          checked={value.active}
          onChange={(event) =>
            onChange({ ...value, active: event.target.checked })
          }
          className="size-4 accent-[#BD0F32]"
        />
        Visible in shop
      </label>
    </div>
  );
}

export function AddProductForm() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProductFormState>(emptyProduct);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name || !form.imageUrl) return;
    setSaving(true);
    try {
      await addProduct(form);
      setForm(emptyProduct);
      setOpen(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-black bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-black hover:text-white"
      >
        Add product
      </button>
    );
  }

  return (
    <div className="rounded-[14px] border border-black bg-white p-5">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-black text-black">Add product</h3>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded border border-black px-3 py-1.5 text-sm font-semibold transition hover:bg-black hover:text-white"
        >
          Cancel
        </button>
      </div>
      <ProductFields value={form} onChange={setForm} />
      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className="mt-5 rounded border border-black bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#BD0F32] disabled:opacity-50"
      >
        {saving ? "Saving..." : "Publish product"}
      </button>
    </div>
  );
}

export function ProductAdminCard({
  product,
}: {
  product: ProductFormState & { id: number };
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProductFormState>(product);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateProduct(product.id, form);
      setEditing(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete ${product.name}?`)) return;
    setSaving(true);
    try {
      await deleteProduct(product.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async () => {
    setSaving(true);
    try {
      await toggleProduct(product.id, !product.active);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[14px] border border-black bg-white p-5">
      {editing ? (
        <div>
          <ProductFields value={form} onChange={setForm} />
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded border border-black bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#BD0F32] disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save changes"}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(product);
                setEditing(false);
              }}
              className="rounded border border-black px-4 py-2 text-sm font-semibold transition hover:bg-black hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[112px_1fr_auto] lg:items-center">
          <div className="relative h-28 w-28 overflow-hidden rounded-[12px] border border-black bg-[#f4f4f4]">
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              sizes="112px"
              className="object-contain p-3"
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-black text-black">{product.name}</h3>
              <span
                className={`rounded border px-2 py-1 text-xs font-semibold ${
                  product.active
                    ? "border-green-600 bg-green-50 text-green-700"
                    : "border-red-400 bg-red-50 text-red-700"
                }`}
              >
                {product.active ? "Live" : "Hidden"}
              </span>
              <span className="text-xs font-semibold text-black/55">
                <BreadAmount amount={product.price} />
              </span>
              <span className="text-xs font-semibold text-black/55">
                {product.stock === null
                  ? "Unlimited stock"
                  : `${product.stock} left`}
              </span>
            </div>
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-black/60">
              {product.description || "No description yet."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded border border-black px-3 py-1.5 text-sm font-semibold transition hover:bg-black hover:text-white"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={toggle}
              disabled={saving}
              className="rounded border border-black px-3 py-1.5 text-sm font-semibold transition hover:bg-black hover:text-white disabled:opacity-50"
            >
              {product.active ? "Hide" : "Show"}
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={saving}
              className="rounded border border-red-700 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 transition hover:bg-red-700 hover:text-white disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
