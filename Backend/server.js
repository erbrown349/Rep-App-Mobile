require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB connected"))
.catch((err) => console.error(err));

// Expanded Workout schema
const workoutSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  label: String,
  reps: { type: Number, default: 0 },
  weight: { type: Number, default: 0 },
  highestReps: { type: Number, default: 0 },
  highestWeight: { type: Number, default: 0 },
  pushups: { type: Number, default: 0 },
  pullups: { type: Number, default: 0 },
  chinups: { type: Number, default: 0 },
  enduranceType: String,
  distance: String,
  time: String,
  plankType: String,
  plankDuration: String,
  stretches: String,
  stretchDuration: String,
  history: [
    {
      reps: Number,
      weight: Number,
      pushups: Number,
      pullups: Number,
      chinups: Number,
      enduranceType: String,
      distance: String,
      time: String,
      plankType: String,
      plankDuration: String,
      stretches: String,
      stretchDuration: String,
      timeStamp: { type: Date, default: Date.now }
    }
  ]
});

const Workout = mongoose.model("Workout", workoutSchema);

// === Routes ===

// Create new workout
app.post("/workouts", async (req, res) => {
  try {
    const workout = new Workout(req.body); // Accept all fields
    await workout.save();
    res.status(201).json(workout);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all workouts
app.get("/workouts", async (req, res) => {
  try {
    const workouts = await Workout.find().sort({ date: -1 });
    res.json(workouts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update entire workout
app.put("/workouts/:id", async (req, res) => {
  try {
    const workout = await Workout.findById(req.params.id);
    if (!workout) return res.status(404).json({ error: "Workout not found" });

    Object.assign(workout, req.body); // merge all fields
    await workout.save();
    res.json(workout);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete a workout
// Delete a history entry from a workout
// Delete a history entry by index
app.delete("/workouts/:id/history/:index", async (req, res) => {
  try {
    const { id, index } = req.params;
    const workout = await Workout.findById(id);

    if (!workout) {
      return res.status(404).json({ error: "Workout not found" });
    }

    console.log("🔎 Workout history length:", workout.history.length);
    console.log("🔎 Requested index to delete:", index);

    const i = parseInt(index, 10);
    if (isNaN(i) || i < 0 || i >= workout.history.length) {
      return res.status(404).json({ error: "History item not found" });
    }

    workout.history.splice(i, 1);
    await workout.save();

    res.json({ message: "History item deleted", workout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});



// Start server
const PORT = process.env.PORT || 5002;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
