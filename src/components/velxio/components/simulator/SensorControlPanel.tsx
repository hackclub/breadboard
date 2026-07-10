// @ts-nocheck
/**
 * SensorControlPanel — wokwi-style interactive sensor controls.
 *
 * Appears at the top-left of the simulation canvas when a sensor component is
 * clicked during simulation.  Provides sliders and buttons that feed values
 * directly into the running simulation via SensorUpdateRegistry.
 */

import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  SENSOR_CONTROLS,
  type SensorControl,
  type SliderControl,
} from "@/lib/velxio/simulation/sensorControlConfig";
import {
  dispatchSensorUpdate,
  getLastSensorValues,
} from "@/lib/velxio/simulation/SensorUpdateRegistry";
import "@/components/velxio/components/simulator/SensorControlPanel.css";

interface SensorControlPanelProps {
  componentId: string;
  metadataId: string;
  sensorName: string;
  onClose: () => void;
}

// ── Section grouping for MPU6050 ────────────────────────────────────────────

interface SensorSection {
  label: string;
  icon: string;
  keys: string[];
}

const MPU6050_SECTIONS: SensorSection[] = [
  { label: "Acceleration", icon: "↗", keys: ["accelX", "accelY", "accelZ"] },
  { label: "Rotation", icon: "↻", keys: ["gyroX", "gyroY", "gyroZ"] },
  { label: "Temperature", icon: "🌡", keys: ["temp"] },
];

// Keys that use single-char axis labels (X / Y / Z) rather than the full key name
const AXIS_KEYS = new Set([
  "accelX",
  "accelY",
  "accelZ",
  "gyroX",
  "gyroY",
  "gyroZ",
]);

// ── Component ───────────────────────────────────────────────────────────────

export const SensorControlPanel: React.FC<SensorControlPanelProps> = ({
  componentId,
  metadataId,
  sensorName,
  onClose,
}) => {
  const { t } = useTranslation();
  const def = SENSOR_CONTROLS[metadataId];

  // Local slider/button state — hydrated from the registry's last-known
  // values for this componentId (so reopening a sensor or switching between
  // two sensors of the same type shows each one's current state, not the
  // previous panel's). Falls back to config defaults the first time a
  // sensor is opened.
  const [values, setValues] = useState<
    Record<string, number | boolean | string>
  >(() => {
    const cached = getLastSensorValues(componentId);
    if (cached) return { ...(def?.defaultValues ?? {}), ...cached };
    return def ? { ...def.defaultValues } : {};
  });

  // Push defaults into simulation on first open for this sensor. Skipped
  // when the sensor already has cached values — the simulation still holds
  // them, no need to clobber.
  useEffect(() => {
    if (
      def &&
      Object.keys(def.defaultValues).length > 0 &&
      !getLastSensorValues(componentId)
    ) {
      dispatchSensorUpdate(componentId, def.defaultValues);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [componentId]);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!def) return null;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSlider = (key: string, raw: string) => {
    const v = parseFloat(raw);
    setValues((prev) => ({ ...prev, [key]: v }));
    dispatchSensorUpdate(componentId, { [key]: v });
  };

  const handleButton = (key: string) => {
    dispatchSensorUpdate(componentId, { [key]: true });
  };

  const handleToggle = (key: string, next: boolean) => {
    setValues((prev) => ({ ...prev, [key]: next }));
    dispatchSensorUpdate(componentId, { [key]: next });
  };

  const handleOption = (key: string, value: number | string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    dispatchSensorUpdate(componentId, { [key]: value });
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderControl = (ctrl: SensorControl) => {
    if (ctrl.type === "button") {
      return (
        <button
          key={ctrl.key}
          type="button"
          className="sensor-trigger-button"
          onClick={() => handleButton(ctrl.key)}
        >
          {ctrl.label}
        </button>
      );
    }

    if (ctrl.type === "toggle") {
      const on = Boolean(values[ctrl.key] ?? ctrl.defaultValue);
      return (
        <div key={ctrl.key} className="sensor-toggle-row">
          <span className="sensor-control-label-wide">{ctrl.label}</span>
          <button
            type="button"
            className={`sensor-toggle${on ? " on" : ""}`}
            role="switch"
            aria-checked={on}
            onClick={() => handleToggle(ctrl.key, !on)}
          >
            <span className="sensor-toggle-track">
              <span className="sensor-toggle-thumb" />
            </span>
            <span className="sensor-toggle-state">
              {on ? (ctrl.onLabel ?? "On") : (ctrl.offLabel ?? "Off")}
            </span>
          </button>
        </div>
      );
    }

    if (ctrl.type === "options") {
      const current = values[ctrl.key] ?? ctrl.defaultValue;
      return (
        <div key={ctrl.key} className="sensor-options-block">
          <span className="sensor-control-label-wide">{ctrl.label}</span>
          <div className="sensor-options-grid">
            {ctrl.options.map((opt) => (
              <button
                type="button"
                key={String(opt.value)}
                className={`sensor-option${current === opt.value ? " selected" : ""}`}
                onClick={() => handleOption(ctrl.key, opt.value)}
                title={opt.hint}
              >
                <span className="sensor-option-label">{opt.label}</span>
                {opt.hint ? (
                  <span className="sensor-option-hint">{opt.hint}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Slider
    const sc = ctrl as SliderControl;
    const val = (values[sc.key] as number) ?? sc.defaultValue;
    const displayVal = sc.formatValue ? sc.formatValue(val) : String(val);
    const isAxisKey = AXIS_KEYS.has(sc.key);

    return (
      <div key={sc.key} className="sensor-control-row">
        <span
          className={
            isAxisKey ? "sensor-control-label" : "sensor-control-label-wide"
          }
        >
          {isAxisKey ? sc.label : sc.label}
        </span>
        <input
          type="range"
          className="sensor-slider"
          min={sc.min}
          max={sc.max}
          step={sc.step}
          value={val}
          onChange={(e) => handleSlider(sc.key, e.target.value)}
        />
        <span className="sensor-value-display">
          {displayVal}
          {sc.unit ? ` ${sc.unit}` : ""}
        </span>
      </div>
    );
  };

  // For MPU6050 render sections; for everything else render controls flat
  const renderControls = () => {
    if (metadataId === "mpu6050") {
      return MPU6050_SECTIONS.map((section) => {
        const sectionControls = def.controls.filter((c) =>
          section.keys.includes(c.key),
        );
        return (
          <React.Fragment key={section.label}>
            <div className="sensor-section-label">
              <span className="sensor-section-icon">{section.icon}</span>
              {section.label}
            </div>
            {sectionControls.map(renderControl)}
          </React.Fragment>
        );
      });
    }
    return def.controls.map(renderControl);
  };

  return (
    <div
      className="sensor-control-panel"
      onClick={(e) => e.stopPropagation()}
      // The canvas treats left mousedown on empty space as a pan gesture.
      // Without stopping mousedown here, dragging the lux/temp/etc. slider
      // thumb pans the canvas instead of moving the slider.
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="sensor-panel-header">
        <span className="sensor-panel-title">{sensorName || def.title}</span>
        <button
          type="button"
          className="sensor-panel-close"
          onClick={onClose}
          title={t("editor.sensorPanel.close")}
        >
          ×
        </button>
      </div>
      {renderControls()}
    </div>
  );
};
