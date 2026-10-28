const mongoose = require('mongoose');

const bloodSchema = new mongoose.Schema({
  bloodGroup: { type: String, required: true, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  units: { type: Number, required: true, min: 1 },
  city: { type: String, required: true },
  hospitalName: String,
  contactPhone: String,
  status: { type: String, enum: ['available', 'requested'], default: 'available' },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Blood', bloodSchema);