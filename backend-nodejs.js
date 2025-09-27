// Backend Server - Node.js with Express.js
// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const reportRoutes = require('./routes/reports');
const socialMediaRoutes = require('./routes/socialMedia');
const analyticsRoutes = require('./routes/analytics');
const userRoutes = require('./routes/users');

// Import middleware
const authMiddleware = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:8080',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files
app.use('/uploads', express.static('uploads'));

// File upload configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed!'), false);
    }
  }
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/wavenet', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('Connected to MongoDB');
  logger.info('Connected to MongoDB');
})
.catch((error) => {
  console.error('MongoDB connection error:', error);
  logger.error('MongoDB connection error:', error);
  process.exit(1);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/social-media', socialMediaRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/users', userRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'WaveNet API',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

app.listen(PORT, () => {
  console.log(`WaveNet server running on port ${PORT}`);
  logger.info(`WaveNet server running on port ${PORT}`);
});

module.exports = app;

// models/Report.js
const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  hazardType: {
    type: String,
    required: true,
    enum: ['tsunami', 'high_waves', 'storm_surge', 'coastal_erosion', 'debris', 'pollution', 'other']
  },
  severity: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical']
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      required: true
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  address: {
    type: String,
    trim: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  images: [{
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    url: String
  }],
  video: {
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    url: String
  },
  status: {
    type: String,
    enum: ['pending', 'verified', 'investigating', 'resolved', 'false_alarm'],
    default: 'pending'
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verificationNotes: String,
  socialMediaMentions: [{
    platform: String,
    postId: String,
    content: String,
    sentiment: Number,
    timestamp: Date
  }],
  tags: [String],
  isPublic: {
    type: Boolean,
    default: true
  },
  emergencyLevel: {
    type: String,
    enum: ['routine', 'watch', 'warning', 'emergency'],
    default: 'routine'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Create geospatial index
reportSchema.index({ location: '2dsphere' });

// Index for efficient queries
reportSchema.index({ hazardType: 1, severity: 1, createdAt: -1 });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ userId: 1, createdAt: -1 });

// Virtual for formatted location
reportSchema.virtual('coordinates').get(function() {
  return {
    latitude: this.location.coordinates[1],
    longitude: this.location.coordinates[0]
  };
});

// Method to calculate distance from a point
reportSchema.methods.distanceFrom = function(longitude, latitude) {
  const earthRadius = 6371; // km
  const dLat = (latitude - this.location.coordinates[1]) * Math.PI / 180;
  const dLon = (longitude - this.location.coordinates[0]) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(this.location.coordinates[1] * Math.PI / 180) * Math.cos(latitude * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return earthRadius * c;
};

module.exports = mongoose.model('Report', reportSchema);

// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['citizen', 'official', 'analyst', 'admin'],
    default: 'citizen'
  },
  profile: {
    firstName: String,
    lastName: String,
    phoneNumber: String,
    organization: String,
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: [Number] // [longitude, latitude]
    },
    avatar: String
  },
  preferences: {
    language: {
      type: String,
      default: 'en'
    },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      sms: { type: Boolean, default: false }
    },
    emergencyAlerts: {
      type: Boolean,
      default: true
    }
  },
  permissions: [{
    type: String,
    enum: [
      'create_report',
      'verify_report',
      'manage_users',
      'view_analytics',
      'manage_system',
      'access_social_media'
    ]
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: Date,
  emailVerified: {
    type: Boolean,
    default: false
  },
  phoneVerified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for geospatial queries
userSchema.index({ 'profile.location': '2dsphere' });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Set default permissions based on role
userSchema.pre('save', function(next) {
  if (this.isModified('role')) {
    switch (this.role) {
      case 'citizen':
        this.permissions = ['create_report'];
        break;
      case 'official':
        this.permissions = ['create_report', 'verify_report'];
        break;
      case 'analyst':
        this.permissions = ['create_report', 'verify_report', 'view_analytics', 'access_social_media'];
        break;
      case 'admin':
        this.permissions = [
          'create_report',
          'verify_report',
          'manage_users',
          'view_analytics',
          'manage_system',
          'access_social_media'
        ];
        break;
    }
  }
  next();
});

module.exports = mongoose.model('User', userSchema);

// routes/reports.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Report = require('../models/Report');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { validateReport } = require('../middleware/validation');
const logger = require('../utils/logger');
const { generateHotspots } = require('../services/hotspotService');
const geoService = require('../services/geoService');

const router = express.Router();

// File upload configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/reports/';
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 10
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed!'), false);
    }
  }
});

// GET /api/reports - Get all reports with filtering and pagination
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      hazardType,
      severity,
      status,
      lat,
      lng,
      radius,
      startDate,
      endDate,
      userId
    } = req.query;

    const query = {};
    
    // Filter by hazard type
    if (hazardType) {
      query.hazardType = { $in: hazardType.split(',') };
    }
    
    // Filter by severity
    if (severity) {
      query.severity = { $in: severity.split(',') };
    }
    
    // Filter by status
    if (status) {
      query.status = { $in: status.split(',') };
    }
    
    // Filter by user
    if (userId) {
      query.userId = userId;
    }
    
    // Filter by date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    // Geospatial filtering
    if (lat && lng && radius) {
      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(lng), parseFloat(lat)]
          },
          $maxDistance: parseFloat(radius) * 1000 // Convert km to meters
        }
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [reports, total] = await Promise.all([
      Report.find(query)
        .populate('userId', 'username profile.firstName profile.lastName')
        .populate('verifiedBy', 'username profile.firstName profile.lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Report.countDocuments(query)
    ]);

    res.json({
      reports,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    logger.error('Error fetching reports:', error);
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// GET /api/reports/hotspots - Get hotspot analysis
router.get('/hotspots', async (req, res) => {
  try {
    const { lat, lng, radius = 50, timeframe = 7 } = req.query;
    
    const hotspots = await generateHotspots({
      center: lat && lng ? [parseFloat(lng), parseFloat(lat)] : null,
      radius: parseFloat(radius),
      timeframeDays: parseInt(timeframe)
    });
    
    res.json({ hotspots });
  } catch (error) {
    logger.error('Error generating hotspots:', error);
    res.status(500).json({ error: 'Failed to generate hotspots' });
  }
});

// GET /api/reports/:id - Get specific report
router.get('/:id', async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('userId', 'username profile.firstName profile.lastName profile.organization')
      .populate('verifiedBy', 'username profile.firstName profile.lastName');
    
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    res.json(report);
  } catch (error) {
    logger.error('Error fetching report:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

// POST /api/reports - Create new report
router.post('/', 
  authMiddleware, 
  upload.fields([
    { name: 'images', maxCount: 5 },
    { name: 'video', maxCount: 1 }
  ]), 
  validateReport,
  async (req, res) => {
    try {
      const {
        title,
        description,
        hazardType,
        severity,
        latitude,
        longitude,
        address,
        tags,
        isPublic = true
      } = req.body;

      // Process uploaded files
      const images = req.files?.images?.map(file => ({
        filename: file.filename,
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        url: `/uploads/reports/${file.filename}`
      })) || [];

      const video = req.files?.video?.[0] ? {
        filename: req.files.video[0].filename,
        originalName: req.files.video[0].originalname,
        mimetype: req.files.video[0].mimetype,
        size: req.files.video[0].size,
        url: `/uploads/reports/${req.files.video[0].filename}`
      } : null;

      // Reverse geocode to get address
      let resolvedAddress = address;
      if (!resolvedAddress && latitude && longitude) {
        try {
          resolvedAddress = await geoService.reverseGeocode(latitude, longitude);
        } catch (geoError) {
          logger.warn('Failed to reverse geocode:', geoError);
        }
      }

      const report = new Report({
        title,
        description,
        hazardType,
        severity,
        location: {
          type: 'Point',
          coordinates: [parseFloat(longitude), parseFloat(latitude)]
        },
        address: resolvedAddress,
        userId: req.user.id,
        images,
        video,
        tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
        isPublic: isPublic === 'true'
      });

      await report.save();
      
      // Populate user information
      await report.populate('userId', 'username profile.firstName profile.lastName');
      
      logger.info(`New report created: ${report._id} by user ${req.user.id}`);
      
      res.status(201).json({
        message: 'Report created successfully',
        report
      });
    } catch (error) {
      logger.error('Error creating report:', error);
      
      // Clean up uploaded files if report creation fails
      if (req.files?.images) {
        req.files.images.forEach(file => {
          fs.unlink(file.path, (err) => {
            if (err) logger.error('Failed to delete uploaded image:', err);
          });
        });
      }
      if (req.files?.video?.[0]) {
        fs.unlink(req.files.video[0].path, (err) => {
          if (err) logger.error('Failed to delete uploaded video:', err);
        });
      }
      
      res.status(500).json({ error: 'Failed to create report' });
    }
  }
);

// PATCH /api/reports/:id/verify - Verify a report
router.patch('/:id/verify', authMiddleware, async (req, res) => {
  try {
    // Check if user has permission to verify reports
    if (!req.user.permissions.includes('verify_report')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { status, verificationNotes, emergencyLevel } = req.body;
    
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    report.status = status;
    report.verifiedBy = req.user.id;
    report.verificationNotes = verificationNotes;
    
    if (emergencyLevel) {
      report.emergencyLevel = emergencyLevel;
    }
    
    await report.save();
    await report.populate('verifiedBy', 'username profile.firstName profile.lastName');
    
    logger.info(`Report ${report._id} verified by user ${req.user.id} with status: ${status}`);
    
    res.json({
      message: 'Report verification updated',
      report
    });
  } catch (error) {
    logger.error('Error verifying report:', error);
    res.status(500).json({ error: 'Failed to verify report' });
  }
});

// DELETE /api/reports/:id - Delete a report
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    // Check if user owns the report or has admin permissions
    if (report.userId.toString() !== req.user.id && !req.user.permissions.includes('manage_system')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    // Delete associated files
    if (report.images) {
      report.images.forEach(image => {
        const filePath = path.join('uploads/reports', image.filename);
        fs.unlink(filePath, (err) => {
          if (err) logger.error('Failed to delete image file:', err);
        });
      });
    }
    
    if (report.video) {
      const filePath = path.join('uploads/reports', report.video.filename);
      fs.unlink(filePath, (err) => {
        if (err) logger.error('Failed to delete video file:', err);
      });
    }
    
    await Report.findByIdAndDelete(req.params.id);
    
    logger.info(`Report ${req.params.id} deleted by user ${req.user.id}`);
    
    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    logger.error('Error deleting report:', error);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

module.exports = router;