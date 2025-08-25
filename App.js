import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Dimensions,
  Platform,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Picker } from "@react-native-picker/picker";
import axios from "axios"; 
import Icon from 'react-native-vector-icons/Ionicons';


const API_BASE = "http://192.168.1.69:5002";
const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

// ---------- utilities ----------
const randomBetween = (min, max) => Math.random() * (max - min) + min;
const isNumber = (s) => /^-?\d*\.?\d*$/.test(String(s || ""));
const fmt = (v) => (v === undefined || v === null ? "" : String(v));
const toInt = (v) => {
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}; 



// (optional) normalize mm:ss or hh:mm:ss into a readable string
const normalizeTime = (s) => {
  if (!s) return "";
  const parts = String(s).split(":").map((p) => p.trim());
  if (parts.some((p) => p === "")) return s;
  if (parts.length === 1) return s; // plain seconds or minutes
  if (parts.length === 2) {
    const [m, sec] = parts;
    if (isNaN(+m) || isNaN(+sec)) return s;
    return `${m.padStart(2, "0")}:${sec.padStart(2, "0")}`;
  }
  if (parts.length >= 3) {
    const [h, m, sec] = parts;
    if (isNaN(+h) || isNaN(+m) || isNaN(+sec)) return s;
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}:${sec.padStart(2, "0")}`;
  }
  return s;
};

// ---------- snowflake ----------
const Snowflake = ({ flake }) => (
  <Circle cx={flake.x} cy={flake.y} r={flake.radius} fill={flake.color} />
);

// ---------- App ----------
export default function App() {
  // navigation
  const [page, setPage] = useState(1); // 1: welcome, 2: add/list, 3: tracker, 4: history
  const [pageHistory, setPageHistory] = useState([]);

  // global lists
  const [workouts, setWorkouts] = useState([]);
  const [selectedWorkout, setSelectedWorkout] = useState(null); // label-based selection for history

  // UI + messages
  const [message, setMessage] = useState("");

  // add workout inputs
  const [workoutName, setWorkoutName] = useState(""); 

  // flakes
  const [flakeColor, setFlakeColor] = useState("white");
  const [flakes, setFlakes] = useState([]);

  // tracker session fields (apply to each workout card item during Page 3)
  // NOTE: we store these per-workout in the workouts array; these are just defaults
  const defaultTrack = {
    reps: 0,
    weight: 0,
    highestReps: 0,
    highestWeight: 0,
    enduranceType: "",
    distance: "",
    time: "",
    pushups: 0,
    pullups: 0,
    chinups: 0,
    plankType: "", // forearm/high/side etc
    plankDuration: "", // seconds or mm:ss
    stretches: "", // comma-separated stretch types
    stretchDuration: "", // minutes
  }; 

  // ---------- effects: flakes init/reset ----------
  useEffect(() => {
    const maxFlakes = 90;
    const rainbowColors = ["red", "orange", "yellow", "green", "blue", "indigo", "violet"];

    const newFlakes = [];
    for (let i = 0; i < maxFlakes; i++) {
      const color =
        flakeColor === "rainbow"
          ? rainbowColors[Math.floor(Math.random() * rainbowColors.length)]
          : flakeColor;
      newFlakes.push({
        x: randomBetween(0, screenWidth),
        y: randomBetween(0, screenHeight),
        radius: randomBetween(2, 6),
        speed: randomBetween(0.5, 1.6),
        drift: randomBetween(-0.5, 0.5),
        color,
      });
    }
    setFlakes(newFlakes);
  }, [flakeColor]);

  // ---------- effects: animate flakes ----------
  useEffect(() => {
    let animationFrameId;

    const animate = () => {
      setFlakes((oldFlakes) =>
        oldFlakes.map((flake) => {
          let newY = flake.y + flake.speed;
          let newX = flake.x + flake.drift;

          if (newY > screenHeight + 6) {
            newY = -6;
            newX = randomBetween(0, screenWidth);
            let newColor = flake.color;
            if (flakeColor === "rainbow") {
              const rainbowColors = ["red", "orange", "yellow", "green", "blue", "indigo", "violet"];
              newColor = rainbowColors[Math.floor(Math.random() * rainbowColors.length)];
            }
            return { ...flake, x: newX, y: newY, color: newColor };
          }
          return { ...flake, x: newX, y: newY };
        })
      );
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animationFrameId);
  }, [flakeColor]);

  // ---------- navigation helpers ----------
  const navigateTo = (newPage) => {
    setPageHistory((prev) => [...prev, page]);
    setPage(newPage);
  };

  const goBack = () => {
    setPageHistory((prev) => {
      if (prev.length === 0) return prev;
      const newHistory = [...prev];
      const lastPage = newHistory.pop();
      setPage(lastPage);
      setMessage("");
      return newHistory;
    }); 
  }; 

  const deleteHistory = async (workoutId, index) => {
    try {
      await axios.delete(`${API_BASE}/workouts/${workoutId}/history/${index}`);
  
      // Update local state immediately
      setWorkouts(prev =>
        prev.map(w =>
          w._id === workoutId
            ? { ...w, history: w.history.filter((_, i) => i !== index) }
            : w
        )
      );
    } catch (err) {
      console.error("Failed to delete history:", err.message);
    }
  };
  
  

  // ---------- API helpers ----------
  // fetch workouts (optional if you already bootstrap from server)
  const fetched = useRef(false);
  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    axios
      .get(`${API_BASE}/workouts`)
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        const withSessionFields = list.map((w) => ({
          ...defaultTrack,
          ...w,
          history: Array.isArray(w.history) ? w.history : [],
        }));
        setWorkouts(withSessionFields);
      })
      .catch(() => {
        // if no API yet, still allow local usage
        setWorkouts([]);
      });
  }, []);

  // ---------- add workout ----------
  const addWorkout = async () => {
    if (!workoutName.trim()) return;
  
    const payload = { label: workoutName.trim(), ...defaultTrack, history: [] };
  
    // temp local ID
    const tempId = `temp-${Date.now()}`;
    const created = { ...payload, _id: tempId };
    setWorkouts((prev) => [...prev, created]);
    setWorkoutName("");
  
    try {
      const res = await axios.post(`${API_BASE}/workouts`, payload);
      const saved = res.data;
      if (saved && saved._id) {
        setWorkouts((prev) =>
          prev.map((w) => (w._id === tempId ? { ...created, ...saved } : w))
        );
      }
    } catch (err) {
      console.error("Failed to save workout:", err);
    }
  };
  
  

  const startCounting = () => {
    if (workouts.length > 0) navigateTo(3);
  };

  // ---------- state helpers ----------
  const updateWorkoutsAt = (index, updater) => {
    setWorkouts((prev) => {
      const next = [...prev];
      next[index] = updater({ ...next[index] });
      return next;
    });
  };

  const syncWorkout = async (w) => {
    try {
      await axios.put(`${API_BASE}/workouts/${w._id}`, w);
    } catch {
      // swallow for offline/dev
    }
  };

  // ---------- incrementers (reps/weight) ----------
  const incrementReps = (index) => {
    let updated;
    updateWorkoutsAt(index, (w) => {
      const current = parseFloat(w.reps) || 0;  // <- convert to number
      w.reps = current + 1;
  
      if (w.reps > (parseFloat(w.highestReps) || 0)) {
        w.highestReps = w.reps;
        setMessage(`🎉 New personal best for ${w.label}: ${w.reps} reps!`);
      } else {
        setMessage("");
      }
      updated = w;
      return w;
    });
    if (updated) syncWorkout(updated);
  };
  
  const incrementWeight = (index) => {
    let updated;
    updateWorkoutsAt(index, (w) => {
      const current = parseFloat(w.weight) || 0;  // <- convert to number
      w.weight = current + 1;
  
      if (w.weight > (parseFloat(w.highestWeight) || 0)) {
        w.highestWeight = w.weight;
        setMessage(`🎉 New personal best for ${w.label}: ${w.weight} lbs!`);
      } else {
        setMessage("");
      }
      updated = w;
      return w;
    });
    if (updated) syncWorkout(updated);
  };
  

  // ---------- bodyweight pills (tap +1, long-press -1) ----------
  const bump = (v, delta) => Math.max(0, toInt(v) + delta);

  const incPush = (index, delta = 1) =>
    updateWorkoutsAt(index, (w) => ({ ...w, pushups: bump(w.pushups, delta) }));
  const incPull = (index, delta = 1) =>
    updateWorkoutsAt(index, (w) => ({ ...w, pullups: bump(w.pullups, delta) }));
  const incChin = (index, delta = 1) =>
    updateWorkoutsAt(index, (w) => ({ ...w, chinups: bump(w.chinups, delta) }));

  const editField = (index, field, value) => {
    updateWorkoutsAt(index, (w) => {
      let val = value;
  
      if (field === "reps" || field === "weight") {
        // Allow empty string, lone ".", or numeric string
        if (value === "" || /^\.?\d*$/.test(value)) {
          val = value;
        }
      } else if (field === "plankDuration") {
        val = normalizeTime(value);
      }
  
      return { ...w, [field]: val };
    });
  };
  
  
  


  // ---------- end workout (save to history, reset counters) ----------
  const endWorkout = async () => {
    const now = new Date();
  
    // 1️⃣ Build updated workouts array
    const updatedWorkouts = workouts.map((w) => {
      // check if any session fields were updated
      const hasChanges =
        w.reps > 0 ||
        w.weight > 0 ||
        w.pushups > 0 ||
        w.pullups > 0 ||
        w.chinups > 0 ||
        (w.enduranceType && w.distance) ||
        w.time ||
        w.plankType ||
        w.plankDuration ||
        w.stretches ||
        w.stretchDuration;
  
      if (!hasChanges) return w; // skip snapshot if nothing changed
  
      const snapshot = { label: w.label, timeStamp: now };
  
      if (w.reps > 0) snapshot.reps = w.reps;
      if (w.weight > 0) snapshot.weight = w.weight;
      if (w.pushups > 0) snapshot.pushups = toInt(w.pushups);
      if (w.pullups > 0) snapshot.pullups = toInt(w.pullups);
      if (w.chinups > 0) snapshot.chinups = toInt(w.chinups);
  
      if (w.enduranceType) snapshot.enduranceType = w.enduranceType;
      if (w.distance) snapshot.distance = w.distance;
      if (w.time) snapshot.time = w.time;
  
      if (w.plankType) snapshot.plankType = w.plankType;
      if (w.plankDuration) snapshot.plankDuration = w.plankDuration;
  
      if (w.stretches) snapshot.stretches = w.stretches;
      if (w.stretchDuration) snapshot.stretchDuration = w.stretchDuration;
  
      // reset numeric session counters
      const reset = {
        reps: 0,
        weight: 0,
        pushups: 0,
        pullups: 0,
        chinups: 0,
      };
  
      return { ...w, history: [...(w.history || []), snapshot], ...reset };
    });
  
    // 2️⃣ Update state
    setWorkouts(updatedWorkouts);
    setMessage("");
    navigateTo(2);
  
    // 3️⃣ Sync only workouts that were updated AND have valid backend IDs
    const workoutsToSync = updatedWorkouts.filter(
      (w) =>
        w._id &&
        !w._id.startsWith("temp-") &&
        w.history[w.history.length - 1]?.timeStamp === now
    );
  
    try {
      await Promise.all(
        workoutsToSync.map((w) =>
          axios.put(`${API_BASE}/workouts/${w._id}`, w).catch((err) => {
            console.warn(`Failed to sync workout ${w.label}:`, err?.response?.data || err);
          })
        )
      );
    } catch (err) {
      console.error("Unexpected error while saving workouts:", err);
    }
  }; 


  

  // ---------- history view helpers ----------
  const openHistory = (label) => {
    setSelectedWorkout(label);
    navigateTo(4);
  };

  const formatDate = (d) => new Date(d).toLocaleString();

  // ---------- Back button (top-centered) ----------
  const BackButton = useMemo(
    () =>
      page !== 1 && page !== 2 ? (  // hide on page 1 and 2
        <TouchableOpacity onPress={goBack} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
      ) : null,
    [page]
  ); 

  const removeWorkout = (index) => {
    const workoutToRemove = workouts[index];
    setWorkouts((prev) => prev.filter((_, i) => i !== index));

    // Optional: remove from backend
    if (workoutToRemove._id && !workoutToRemove._id.startsWith("temp-")) {
      axios.delete(`${API_BASE}/workouts/${workoutToRemove._id}`).catch(() => {});
    }
  };

  // ---------- render ----------
  return (
    <View style={styles.container}>
      {/* Snowflakes (rendered under UI; zIndex below) */}
      <Svg height={screenHeight} width={screenWidth} style={StyleSheet.absoluteFill}>
        {flakes.map((flake, index) => (
          <Snowflake key={`flake-${index}`} flake={flake} />
        ))}
      </Svg>

      {/* Back top center */}
      {BackButton}

      {page === 1 && (
        <>
          <Text style={styles.title}>Welcome to Workout Tracker</Text>
          <Text style={styles.headerText}>
            Log reps, weight, endurance (distance & time), pushups, pullups, chinups, planks, and stretches. Track
            personal bests and view your history.
          </Text>
          <TouchableOpacity onPress={() => setPage(2)} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Start</Text>
          </TouchableOpacity>
        </>
      )}
{page === 2 && (
  <View style={{ flex: 1, width: "100%" }}>
    {/* Top section */}
    <View style={{ alignItems: "center", paddingHorizontal: 12 }}>
      <Text style={styles.title}>Add Your Workouts</Text>

      <View style={styles.addRow}>
        <TextInput
          placeholder="Workout name"
          value={workoutName}
          onChangeText={setWorkoutName}
          placeholderTextColor="#cfcfcf"
          style={[styles.input, styles.addRowInput]}
          returnKeyType="done"
        />
        <TouchableOpacity
          onPress={addWorkout}
          disabled={!workoutName.trim()}
          style={[styles.addBtn, !workoutName.trim() && styles.disabledBtn]}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.colorRow}>
        <Text style={styles.colorRowLabel}>Snowflake Color:</Text>
        <View style={styles.pickerWrapper}>
          <Picker
            selectedValue={flakeColor}
            onValueChange={(v) => setFlakeColor(v)}
            dropdownIconColor="#fff"
            style={styles.picker}
            itemStyle={{ height: 40 }}
          >
            <Picker.Item label="White" value="white" />
            <Picker.Item label="Red" value="red" />
            <Picker.Item label="Blue" value="blue" />
            <Picker.Item label="Purple" value="purple" />
            <Picker.Item label="Pink" value="pink" />
            <Picker.Item label="Rainbow" value="rainbow" />
          </Picker>
        </View>
      </View>
    </View>

    {/* Scrollable workout list */}
    <View style={{ flex: 1 }}>
      <FlatList
        data={workouts}
        keyExtractor={(item, index) => item?._id ?? `${item?.label}-${index}`}
        contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 20, paddingBottom: 14 }}
        renderItem={({ item, index }) => (
          <View style={styles.workoutItemRow}>
            <TouchableOpacity onPress={() => openHistory(item.label)} style={{ flex: 1 }}>
              <Text style={styles.workoutLink}>{item.label}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => removeWorkout(index)} style={styles.removeBtn}>
              <Text style={styles.removeBtnText}>Remove</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: "#bbb", textAlign: "center", marginTop: 20 }}>
            Add a workout above to get started.
          </Text>
        }
      />
    </View>

    {/* Fixed button at bottom */}
    <TouchableOpacity
      onPress={startCounting}
      disabled={workouts.length === 0}
      style={[
        styles.primaryBtn,
        workouts.length === 0 && styles.disabledBtn,
        { margin: 12, alignSelf: "center" },
      ]}
    >
      <Text style={styles.primaryBtnText}>Begin Workout</Text>
    </TouchableOpacity>
  </View>
)}


      

      
 
      {page === 3 && (
        <>
          <Text style={styles.title}>Workout Tracker</Text>
          {message ? <Text style={styles.toast}>{message}</Text> : null}

          <FlatList
            data={workouts}
            keyExtractor={(item, index) => item?._id ?? `${item?.label}-${index}`}
            style={{ width: "100%" }}
            contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 100 }}
            renderItem={({ item, index }) => (
              <View style={styles.card}>
                {/* tappable title to open history for this workout */}
                <TouchableOpacity onPress={() => openHistory(item.label)} style={{ alignSelf: "flex-start" }}>
                  <Text style={styles.cardTitle}>{item.label}</Text>
                </TouchableOpacity>

                {/* Top counters row */}
                {/* Top counters row */}
<View style={styles.counterRow}>
  <View style={styles.counterCol}>
    <Text style={styles.counterLabel}>Reps</Text>
    <TextInput
  style={styles.counterValueInput}
  keyboardType={Platform.OS === "android" ? "decimal-pad" : "numbers-and-punctuation"}
  value={fmt(item.reps)}
  onChangeText={(v) => editField(index, "reps", v)}
/>

    <TouchableOpacity style={styles.counterBtn} onPress={() => incrementReps(index)}>
      <Text style={styles.counterBtnText}>+1 rep</Text>
    </TouchableOpacity>
  </View>

  <View style={styles.counterCol}>
    <Text style={styles.counterLabel}>Weight</Text>
    <TextInput
  style={styles.counterValueInput}
  keyboardType={Platform.OS === "android" ? "decimal-pad" : "numbers-and-punctuation"}
  value={fmt(item.weight)}
  onChangeText={(v) => editField(index, "weight", v)}
/>

    <TouchableOpacity style={styles.counterBtn} onPress={() => incrementWeight(index)}>
      <Text style={styles.counterBtnText}>+1 lb</Text>
    </TouchableOpacity>
  </View>
</View>


                <View style={styles.hr} />

                {/* Running / Endurance */}
                <View style={styles.gridRow}>
                  <View style={styles.gridCol}>
                    <Text style={styles.sectionHeading}>🏃 Running</Text>
                    <TextInput
                      placeholder="Distance (miles)"
                      placeholderTextColor="#cfcfcf"
                      value={fmt(item.distance)}
                      onChangeText={(v) => {
                        if (isNumber(v)) editField(index, "distance", v);
                      }}
                      keyboardType={Platform.OS === "android" ? "numeric" : "numbers-and-punctuation"}
                      style={styles.input}
                      returnKeyType="done"
                    />
                    <TextInput
  placeholder="Time (HH:MM:SS or MM:SS)"
  placeholderTextColor="#cfcfcf"
  value={fmt(item.time)}
  onChangeText={(v) => editField(index, "time", v)}
  style={styles.input}
  returnKeyType="done"
  keyboardType={Platform.OS === "android" ? "default" : "numbers-and-punctuation"}
/>


                  </View>

                  <View style={styles.gridCol}>
                    <Text style={styles.sectionHeading}>💪 Endurance</Text>
                    <TextInput
                      placeholder="Endurance Type (e.g., Run, Bike)"
                      placeholderTextColor="#cfcfcf"
                      value={fmt(item.enduranceType)}
                      onChangeText={(v) => editField(index, "enduranceType", v)}
                      style={styles.input}
                      returnKeyType="done"
                    />
                    <View style={styles.inline3}>
                      <TouchableOpacity
                        style={styles.smallPill}
                        onPress={() => incPush(index, +1)}
                        onLongPress={() => incPush(index, -1)}
                        delayLongPress={250}
                      >
                        <Text style={styles.smallPillText}>Pushups +1 (hold -1)</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.inline3}>
                      <TouchableOpacity
                        style={styles.smallPill}
                        onPress={() => incPull(index, +1)}
                        onLongPress={() => incPull(index, -1)}
                        delayLongPress={250}
                      >
                        <Text style={styles.smallPillText}>Pullups +1 (hold -1)</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.inline3}>
                      <TouchableOpacity
                        style={styles.smallPill}
                        onPress={() => incChin(index, +1)}
                        onLongPress={() => incChin(index, -1)}
                        delayLongPress={250}
                      >
                        <Text style={styles.smallPillText}>Chinups +1 (hold -1)</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.inlineStats}>
                      <Text style={styles.inlineStatText}>Pushups: {toInt(item.pushups)}</Text>
                      <Text style={styles.inlineStatText}>Pullups: {toInt(item.pullups)}</Text>
                      <Text style={styles.inlineStatText}>Chinups: {toInt(item.chinups)}</Text>
                    </View>
                  </View>
                </View>

                {/* Plank / Stretch */}
                <View style={styles.gridRow}>
                  <View style={styles.gridCol}>
                    <Text style={styles.sectionHeading}>🧘 Plank/Combat</Text>
                    <TextInput
                      placeholder="Plank/Combat Type"
                      placeholderTextColor="#cfcfcf"
                      value={fmt(item.plankType)}
                      onChangeText={(v) => editField(index, "plankType", v)}
                      style={styles.input}
                      returnKeyType="done"
                    />
                    <TextInput
                      placeholder="Duration (seconds or mm:ss)"
                      placeholderTextColor="#cfcfcf"
                      value={fmt(item.plankDuration)}
                      onChangeText={(v) => editField(index, "plankDuration", v)}
                      onEndEditing={(e) =>
                        editField(index, "plankDuration", normalizeTime(e.nativeEvent.text))
                      }
                      // allow ":" input on iOS keyboard
                      keyboardType={Platform.OS === "android" ? "numeric" : "numbers-and-punctuation"}
                      style={styles.input}
                      returnKeyType="done"
                    />
                  </View>

                  <View style={styles.gridCol}>
                    <Text style={styles.sectionHeading}>🤸 Stretching</Text>
                    <TextInput
                      placeholder="Stretch Type(s) (e.g., hamstring, hip flexor)"
                      placeholderTextColor="#cfcfcf"
                      value={fmt(item.stretches)}
                      onChangeText={(v) => editField(index, "stretches", v)}
                      style={styles.input}
                      returnKeyType="done"
                    />
                    <TextInput
                      placeholder="Duration (minutes)"
                      placeholderTextColor="#cfcfcf"
                      value={fmt(item.stretchDuration)}
                      onChangeText={(v) => {
                        if (isNumber(v)) editField(index, "stretchDuration", v);
                      }}
                      keyboardType={Platform.OS === "android" ? "numeric" : "numbers-and-punctuation"}
                      style={styles.input}
                      returnKeyType="done"
                    />
                  </View>
                </View>
              </View>
            )}
          /> 
          <TouchableOpacity style={styles.backButton} onPress={goBack}>
  <Icon name="arrow-back" size={20} color="white" />
  <Text style={[styles.backText, { marginLeft: 6 }]}>Back</Text>
</TouchableOpacity>

          <TouchableOpacity onPress={endWorkout} style={[styles.primaryBtn, styles.endBtn]}>
            <Text style={styles.primaryBtnText}>End Set</Text>
          </TouchableOpacity>
        </>
      )}

{page === 4 && selectedWorkout && (
  <View style={{ flex: 1, position: "relative", width: "100%", alignItems: "center", paddingHorizontal: 14 }}>
    <Text style={styles.title}>History for {selectedWorkout}</Text>

    <FlatList
      data={workouts.find((w) => w.label === selectedWorkout)?.history || []}
      keyExtractor={(_, i) => `${selectedWorkout}-h-${i}`}
      style={{ width: "100%" }}
      contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 6 }}
      renderItem={({ item, index }) => {
        const workoutIndex = workouts.findIndex((w) => w.label === selectedWorkout);
        return (
          <View style={[styles.historyItem, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.historyLine}>
                <Text style={styles.bold}>Reps:</Text> {item.reps}  •  <Text style={styles.bold}>Weight:</Text> {item.weight} lbs
              </Text>
              <Text style={styles.historyLine}>
                <Text style={styles.bold}>PB Reps:</Text> {item.highestReps}  •  <Text style={styles.bold}>PB Wt:</Text> {item.highestWeight}
              </Text>
              <Text style={styles.historyLine}>
                <Text style={styles.bold}>Endurance:</Text> {item.enduranceType || "-"} {item.distance ? `${item.distance} mi` : ""}{item.time ? ` in ${item.time}` : ""}
              </Text>
              <Text style={styles.historyLine}>
                <Text style={styles.bold}>Pushups:</Text> {toInt(item.pushups)}  •  <Text style={styles.bold}>Pullups:</Text> {toInt(item.pullups)}  •  <Text style={styles.bold}>Chinups:</Text> {toInt(item.chinups)}
              </Text>
              <Text style={styles.historyLine}>
                <Text style={styles.bold}>Plank/Combat:</Text> {item.plankType || "-"} {item.plankDuration ? `for ${item.plankDuration}` : ""}
              </Text>
              <Text style={styles.historyLine}>
                <Text style={styles.bold}>Stretches:</Text> {item.stretches || "-"} {item.stretchDuration ? `for ${item.stretchDuration} min` : ""}
              </Text>
              <Text style={styles.historyTime}>{formatDate(item.timeStamp)}</Text>
            </View>

            <TouchableOpacity
  onPress={() => deleteHistory(workouts[workoutIndex]._id, index)}
  style={{ padding: 6 }}
>
  <Text style={{ color: "red", fontWeight: "bold" }}>Delete</Text>
</TouchableOpacity>
          </View>
        );
      }}
      ListEmptyComponent={<Text style={{ color: "#ccc" }}>No history yet.</Text>}
    />

    <TouchableOpacity style={styles.backButton} onPress={goBack}>
      <Icon name="arrow-back" size={18} color="white" />
      <Text style={[styles.backText, { marginLeft: 6 }]}>Back</Text>
    </TouchableOpacity>
  </View>
)}


      
    </View>
  );
}  




// ---------- styles ----------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "black",
    paddingTop: 50,
    paddingHorizontal: 16,
    alignItems: "center",
  },

  // titles + text
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: "white",
    marginBottom: 16,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  headerText: {
    fontSize: 18,
    color: "#d6d6d6",
    textAlign: "center",
    marginBottom: 24,
    paddingHorizontal: 18,
    lineHeight: 24,
  },
  bold: { fontWeight: "700", color: "white" },

  // buttons
  primaryBtn: {
    backgroundColor: "#58aaf7",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 30,
    alignSelf: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: {
    color: "white",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  disabledBtn: {
    opacity: 0.5,
  },
  addBtn: {
    backgroundColor: "#aab6df",
    borderRadius: 10,
    paddingHorizontal: 22,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnText: { color: "#0b0b14", fontWeight: "800", fontSize: 16 },

  // back button (top center; ensure above flakes)
  backButton: {
    position: "absolute",
    bottom: 40,       // distance from bottom
    left: 16,         // left corner
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#58aaf7",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    zIndex: 1000,
    elevation: 8,
  },
  backText: { color: "white", fontSize: 18, fontWeight: "700" },

  // inputs
  input: {
    width: "100%",
    minHeight: 44,
    borderColor: "#777",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    color: "white",
    backgroundColor: "#111",
    marginBottom: 10,
  },
  addRow: {
    width: "92%",
    maxWidth: 820,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  addRowInput: {
    flex: 1,
  },

  colorRow: {
    marginTop: 14,
    width: "92%",
    maxWidth: 520,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  colorRowLabel: {
    color: "white",
    fontWeight: "700",
    fontSize: 18,
  },
  pickerWrapper: {
    flex: 1,
  borderWidth: 1,
  borderColor: '#fff',
  borderRadius: 12,
  backgroundColor: '#',
  justifyContent: 'center',
  },
  picker: {
    height: 40,          // aligns the text properly
  color: '#fff',       // text color
  width: '100%',       // fill the wrapper
  margin: 0,           // remove extra margin
  padding: 0,   
  }, 
  

  // list items
  workoutItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: "100%",
  },
  workoutLink: {
    color: "lightblue",
    fontSize: 20,
    textDecorationLine: "underline",
  },

  // tracker card
  card: {
    backgroundColor: "#0f0f0f",
    borderRadius: 12,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  cardTitle: {
    color: "white",
    fontSize: 22,
    fontWeight: "800",
    textDecorationLine: "underline",
    marginBottom: 6,
  },
  counterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 18,
  },
  counterCol: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#111",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262626",
  },
  counterLabel: { color: "#e9e9e9", fontSize: 18, marginBottom: 6, fontWeight: "700" },
  counterValue: { color: "white", fontSize: 24, fontWeight: "900", marginBottom: 10 },
  counterBtn: {
    backgroundColor: "#58aaf7",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  counterBtnText: {
    color: "white",
    fontWeight: "800",
    fontSize: 16,
  },

  hr: {
    marginVertical: 14,
    height: 1,
    backgroundColor: "#2e2e2e",
    width: "100%",
  },

  gridRow: {
    flexDirection: "row",
    gap: 16,
  },
  gridCol: {
    flex: 1,
  },
  sectionHeading: {
    color: "white",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 8,
  },

  inline3: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    marginBottom: 6,
  },
  smallPill: {
    backgroundColor: "#2a2f3e",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#3a4055",
    minWidth: 180,
    alignItems: "center",
  },
  smallPillText: {
    color: "white",
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  inlineStats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  inlineStatText: {
    color: "#eaeaea",
  },

  toast: {
    fontSize: 16,
    color: "lightgreen",
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },

  endBtn: {
    backgroundColor: "#e55353",
    marginTop: 14,
  }, 
  removeBtn: {
    backgroundColor: "#aa2222",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  removeBtnText: { color: "white", fontSize: 14 },
  workoutItemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#222",
    padding: 12,
    borderRadius: 8,
    marginVertical: 4,
  },

  historyItem: {
    borderWidth: 1,
    borderColor: "#2a2a2a",
    backgroundColor: "#0f0f0f",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  historyLine: {
    color: "white",
    fontSize: 15,
    marginBottom: 4,
  },
  historyTime: {
    color: "#cfcfcf",
    fontSize: 13,
    marginTop: 4,
  },  
  counterValueInput: {
    fontSize: 20,        // big enough to read
    color: "white",      // visible text
    fontWeight: "700",   // bold like your card numbers
    textAlign: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "#444", // optional, makes input stand out
    borderRadius: 6,
    backgroundColor: "#222", // optional, contrast with text
    minWidth: 60,       // prevent shrinking too small
  }, 
});


