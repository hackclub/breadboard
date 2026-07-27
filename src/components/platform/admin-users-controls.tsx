"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { buttonClass } from "@/components/ui/button";
import { inputClass } from "@/components/ui/input";

export type AdminAdjustment = {
  amount: number;
  currency: "bread" | "gold";
  reason: string;
  actorName: string;
  at: string;
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  slackId: string | null;
  emailVerified: boolean;
  admin: boolean;
  yswsEligible: boolean;
  yswsExempt: boolean;
  createdAt: string;
  updatedAt: string;
  balance: number;
  goldBalance: number;
  projectCount: number;
  submittedProjectCount: number;
  totalHours: number;
  submittedHours: number;
  orderCount: number;
  pendingOrderCount: number;
  accountProviders: string[];
  activeSessionCount: number;
  adjustments: AdminAdjustment[];
};

type FieldType = "text" | "number" | "boolean";

// Every column an admin can filter or sort by. `key` indexes AdminUser.
export type FieldKey =
  | "name"
  | "email"
  | "balance"
  | "goldBalance"
  | "projectCount"
  | "submittedProjectCount"
  | "totalHours"
  | "submittedHours"
  | "orderCount"
  | "pendingOrderCount"
  | "activeSessionCount"
  | "admin"
  | "yswsEligible"
  | "yswsExempt"
  | "emailVerified";

export const USER_FIELDS: { key: FieldKey; label: string; type: FieldType }[] =
  [
    { key: "name", label: "Name", type: "text" },
    { key: "email", label: "Email", type: "text" },
    { key: "balance", label: "Bread", type: "number" },
    { key: "goldBalance", label: "Gold", type: "number" },
    { key: "projectCount", label: "Projects", type: "number" },
    {
      key: "submittedProjectCount",
      label: "Submitted projects",
      type: "number",
    },
    { key: "totalHours", label: "Hours", type: "number" },
    { key: "submittedHours", label: "Submitted hours", type: "number" },
    { key: "orderCount", label: "Orders", type: "number" },
    { key: "pendingOrderCount", label: "Pending orders", type: "number" },
    { key: "activeSessionCount", label: "Sessions", type: "number" },
    { key: "admin", label: "Admin", type: "boolean" },
    { key: "yswsEligible", label: "YSWS eligible", type: "boolean" },
    { key: "yswsExempt", label: "YSWS exempt", type: "boolean" },
    { key: "emailVerified", label: "Email verified", type: "boolean" },
  ];

const FIELD_TYPE = new Map(USER_FIELDS.map((f) => [f.key, f.type]));

function fieldType(key: FieldKey): FieldType {
  return FIELD_TYPE.get(key) ?? "text";
}

type Operator = { value: string; label: string; noValue?: boolean };

const OPERATORS: Record<FieldType, Operator[]> = {
  text: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "does not contain" },
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
    { value: "empty", label: "is empty", noValue: true },
    { value: "not_empty", label: "is not empty", noValue: true },
  ],
  number: [
    { value: "eq", label: "=" },
    { value: "neq", label: "≠" },
    { value: "gt", label: ">" },
    { value: "gte", label: "≥" },
    { value: "lt", label: "<" },
    { value: "lte", label: "≤" },
  ],
  boolean: [{ value: "is", label: "is" }],
};

export type FilterCondition = {
  id: string;
  field: FieldKey;
  operator: string;
  value: string;
};

export type Conjunction = "and" | "or";

export type SortRule = {
  id: string;
  field: FieldKey;
  direction: "asc" | "desc";
};

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function newCondition(): FilterCondition {
  return { id: nextId("f"), field: "name", operator: "contains", value: "" };
}

export function newSortRule(): SortRule {
  return { id: nextId("s"), field: "balance", direction: "desc" };
}

function operatorNeedsValue(field: FieldKey, operator: string) {
  const op = OPERATORS[fieldType(field)].find((o) => o.value === operator);
  return !op?.noValue;
}

function isConditionComplete(condition: FilterCondition) {
  const type = fieldType(condition.field);
  if (!operatorNeedsValue(condition.field, condition.operator)) return true;
  if (type === "number") return condition.value.trim() !== "";
  if (type === "boolean") return true;
  return condition.value.trim() !== "";
}

function evaluateCondition(user: AdminUser, condition: FilterCondition) {
  const type = fieldType(condition.field);
  const raw = user[condition.field];

  if (type === "text") {
    const value = String(raw ?? "").toLowerCase();
    const query = condition.value.trim().toLowerCase();
    switch (condition.operator) {
      case "contains":
        return value.includes(query);
      case "not_contains":
        return !value.includes(query);
      case "is":
        return value === query;
      case "is_not":
        return value !== query;
      case "empty":
        return value.length === 0;
      case "not_empty":
        return value.length > 0;
      default:
        return true;
    }
  }

  if (type === "number") {
    const value = Number(raw ?? 0);
    const query = Number(condition.value);
    if (Number.isNaN(query)) return true;
    switch (condition.operator) {
      case "eq":
        return value === query;
      case "neq":
        return value !== query;
      case "gt":
        return value > query;
      case "gte":
        return value >= query;
      case "lt":
        return value < query;
      case "lte":
        return value <= query;
      default:
        return true;
    }
  }

  return Boolean(raw) === (condition.value === "true");
}

function compareValues(
  a: string | number | boolean,
  b: string | number | boolean,
) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean")
    return a === b ? 0 : a ? 1 : -1;
  return String(a).localeCompare(String(b));
}

export function applyFilterSort(
  users: AdminUser[],
  conditions: FilterCondition[],
  conjunction: Conjunction,
  sortRules: SortRule[],
) {
  const active = conditions.filter(isConditionComplete);

  const filtered = users.filter((user) => {
    if (active.length === 0) return true;
    return conjunction === "and"
      ? active.every((condition) => evaluateCondition(user, condition))
      : active.some((condition) => evaluateCondition(user, condition));
  });

  if (sortRules.length === 0) return filtered;

  return [...filtered].sort((a, b) => {
    for (const rule of sortRules) {
      const result = compareValues(a[rule.field], b[rule.field]);
      if (result !== 0) return rule.direction === "asc" ? result : -result;
    }
    return 0;
  });
}

function directionLabel(field: FieldKey, direction: "asc" | "desc") {
  const type = fieldType(field);
  if (type === "number") return direction === "asc" ? "1 → 9" : "9 → 1";
  if (type === "boolean")
    return direction === "asc" ? "Unchecked first" : "Checked first";
  return direction === "asc" ? "A → Z" : "Z → A";
}

function FieldSelect({
  value,
  onChange,
}: {
  value: FieldKey;
  onChange: (field: FieldKey) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as FieldKey)}
      className={inputClass("bg-white py-1.5")}
    >
      {USER_FIELDS.map((field) => (
        <option key={field.key} value={field.key}>
          {field.label}
        </option>
      ))}
    </select>
  );
}

function Popover({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node))
        setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={buttonClass({
          tone: count > 0 ? "ink" : "paper",
          size: "sm",
        })}
      >
        {label}
        {count > 0 ? (
          <span className="grid size-5 place-items-center rounded-full bg-white text-[11px] text-black">
            {count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-[min(92vw,560px)] rounded-[14px] border border-black bg-white p-4 shadow-[5px_5px_0_#000]">
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function FilterPopover({
  conditions,
  conjunction,
  onConditionsChange,
  onConjunctionChange,
}: {
  conditions: FilterCondition[];
  conjunction: Conjunction;
  onConditionsChange: (conditions: FilterCondition[]) => void;
  onConjunctionChange: (conjunction: Conjunction) => void;
}) {
  const conjunctionId = useId();

  const update = (id: string, patch: Partial<FilterCondition>) =>
    onConditionsChange(
      conditions.map((condition) =>
        condition.id === id ? { ...condition, ...patch } : condition,
      ),
    );

  const changeField = (id: string, field: FieldKey) => {
    const firstOperator = OPERATORS[fieldType(field)][0];
    const value = fieldType(field) === "boolean" ? "true" : "";
    update(id, { field, operator: firstOperator.value, value });
  };

  const changeOperator = (id: string, operator: string) =>
    update(id, { operator });

  const remove = (id: string) =>
    onConditionsChange(conditions.filter((condition) => condition.id !== id));

  return (
    <Popover label="Filter" count={conditions.length}>
      {() => (
        <div className="space-y-3">
          {conditions.length === 0 ? (
            <p className="text-sm font-semibold text-black/55">
              No filters applied to this view.
            </p>
          ) : (
            <div className="space-y-2">
              {conditions.map((condition, index) => {
                const type = fieldType(condition.field);
                const showValue = operatorNeedsValue(
                  condition.field,
                  condition.operator,
                );
                return (
                  <div
                    key={condition.id}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <div className="w-16 shrink-0 text-sm font-black text-black/70">
                      {index === 0 ? (
                        "Where"
                      ) : index === 1 ? (
                        <select
                          aria-label="Combine filters with"
                          id={conjunctionId}
                          value={conjunction}
                          onChange={(event) =>
                            onConjunctionChange(
                              event.target.value as Conjunction,
                            )
                          }
                          className={inputClass("bg-white px-2 py-1.5")}
                        >
                          <option value="and">and</option>
                          <option value="or">or</option>
                        </select>
                      ) : (
                        <span className="pl-1">{conjunction}</span>
                      )}
                    </div>
                    <FieldSelect
                      value={condition.field}
                      onChange={(field) => changeField(condition.id, field)}
                    />
                    <select
                      value={condition.operator}
                      onChange={(event) =>
                        changeOperator(condition.id, event.target.value)
                      }
                      className={inputClass("bg-white py-1.5")}
                    >
                      {OPERATORS[type].map((operator) => (
                        <option key={operator.value} value={operator.value}>
                          {operator.label}
                        </option>
                      ))}
                    </select>
                    {showValue ? (
                      type === "boolean" ? (
                        <select
                          value={condition.value || "true"}
                          onChange={(event) =>
                            update(condition.id, { value: event.target.value })
                          }
                          className={inputClass("bg-white py-1.5")}
                        >
                          <option value="true">checked</option>
                          <option value="false">unchecked</option>
                        </select>
                      ) : (
                        <input
                          type={type === "number" ? "number" : "text"}
                          value={condition.value}
                          onChange={(event) =>
                            update(condition.id, { value: event.target.value })
                          }
                          placeholder="Value"
                          className={inputClass("w-32 bg-white py-1.5")}
                        />
                      )
                    ) : null}
                    <button
                      type="button"
                      aria-label="Remove filter"
                      onClick={() => remove(condition.id)}
                      className="ml-auto grid size-7 place-items-center rounded-lg border border-black/15 text-black/60 hover:border-black hover:bg-black hover:text-white"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() =>
                onConditionsChange([...conditions, newCondition()])
              }
              className={buttonClass({ tone: "paper", size: "sm" })}
            >
              + Add condition
            </button>
            {conditions.length > 0 ? (
              <button
                type="button"
                onClick={() => onConditionsChange([])}
                className="text-sm font-black text-[#BD0F32] hover:underline"
              >
                Clear all
              </button>
            ) : null}
          </div>
        </div>
      )}
    </Popover>
  );
}

export function SortPopover({
  rules,
  onRulesChange,
}: {
  rules: SortRule[];
  onRulesChange: (rules: SortRule[]) => void;
}) {
  const update = (id: string, patch: Partial<SortRule>) =>
    onRulesChange(
      rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    );

  const remove = (id: string) =>
    onRulesChange(rules.filter((rule) => rule.id !== id));

  return (
    <Popover label="Sort" count={rules.length}>
      {() => (
        <div className="space-y-3">
          {rules.length === 0 ? (
            <p className="text-sm font-semibold text-black/55">
              No sorts applied to this view.
            </p>
          ) : (
            <div className="space-y-2">
              {rules.map((rule, index) => (
                <div
                  key={rule.id}
                  className="flex flex-wrap items-center gap-2"
                >
                  <span className="w-14 shrink-0 text-sm font-black text-black/70">
                    {index === 0 ? "Sort by" : "then by"}
                  </span>
                  <FieldSelect
                    value={rule.field}
                    onChange={(field) => update(rule.id, { field })}
                  />
                  <select
                    value={rule.direction}
                    onChange={(event) =>
                      update(rule.id, {
                        direction: event.target.value as "asc" | "desc",
                      })
                    }
                    className={inputClass("bg-white py-1.5")}
                  >
                    <option value="asc">
                      {directionLabel(rule.field, "asc")}
                    </option>
                    <option value="desc">
                      {directionLabel(rule.field, "desc")}
                    </option>
                  </select>
                  <button
                    type="button"
                    aria-label="Remove sort"
                    onClick={() => remove(rule.id)}
                    className="ml-auto grid size-7 place-items-center rounded-lg border border-black/15 text-black/60 hover:border-black hover:bg-black hover:text-white"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => onRulesChange([...rules, newSortRule()])}
              className={buttonClass({ tone: "paper", size: "sm" })}
            >
              + Add sort
            </button>
            {rules.length > 0 ? (
              <button
                type="button"
                onClick={() => onRulesChange([])}
                className="text-sm font-black text-[#BD0F32] hover:underline"
              >
                Clear all
              </button>
            ) : null}
          </div>
        </div>
      )}
    </Popover>
  );
}

// Toggles a column header as the primary sort: same field flips direction,
// a new field becomes the sole sort rule.
export function toggleHeaderSort(
  rules: SortRule[],
  field: FieldKey,
): SortRule[] {
  const primary = rules[0];
  if (primary?.field === field) {
    return [
      { ...primary, direction: primary.direction === "asc" ? "desc" : "asc" },
      ...rules.slice(1),
    ];
  }
  return [{ id: nextId("s"), field, direction: "desc" }];
}

export function headerSortIndicator(rules: SortRule[], field: FieldKey) {
  if (rules[0]?.field !== field) return "";
  return rules[0].direction === "asc" ? "↑" : "↓";
}
