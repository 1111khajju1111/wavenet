// lib/main.dart
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'dart:io' if (dart.library.html) 'dart:html' as html;
import 'screens/home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/report_screen.dart';
import 'screens/dashboard_screen.dart';
import 'providers/auth_provider.dart';
import 'providers/location_provider.dart';
import 'providers/report_provider.dart';
import 'services/database_service.dart';
import 'services/api_service.dart';
import 'utils/app_localizations.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  
  // Initialize database
  await DatabaseService.instance.initDatabase();
  
  runApp(const WaveNetApp());
}

class WaveNetApp extends StatelessWidget {
  const WaveNetApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => LocationProvider()),
        ChangeNotifierProvider(create: (_) => ReportProvider()),
      ],
      child: Consumer<AuthProvider>(
        builder: (context, auth, _) {
          return MaterialApp(
            title: 'WaveNet',
            debugShowCheckedModeBanner: false,
            theme: ThemeData(
              colorScheme: ColorScheme.fromSeed(
                seedColor: const Color(0xFF1976D2),
                brightness: Brightness.light,
              ),
              useMaterial3: true,
              fontFamily: 'Roboto',
            ),
            darkTheme: ThemeData(
              colorScheme: ColorScheme.fromSeed(
                seedColor: const Color(0xFF1976D2),
                brightness: Brightness.dark,
              ),
              useMaterial3: true,
              fontFamily: 'Roboto',
            ),
            localizationsDelegates: const [
              AppLocalizations.delegate,
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            supportedLocales: const [
              Locale('en', ''), // English
              Locale('es', ''), // Spanish
              Locale('fr', ''), // French
              Locale('hi', ''), // Hindi
              Locale('te', ''), // Telugu
              Locale('ta', ''), // Tamil
            ],
            home: auth.isAuthenticated ? const HomeScreen() : const LoginScreen(),
            routes: {
              '/home': (context) => const HomeScreen(),
              '/login': (context) => const LoginScreen(),
              '/report': (context) => const ReportScreen(),
              '/dashboard': (context) => const DashboardScreen(),
            },
          );
        },
      ),
    );
  }
}

// lib/screens/home_screen.dart
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:provider/provider.dart';
import 'package:geolocator/geolocator.dart';
import '../providers/location_provider.dart';
import '../providers/report_provider.dart';
import '../providers/auth_provider.dart';
import '../widgets/custom_app_bar.dart';
import '../widgets/floating_action_menu.dart';
import '../widgets/report_bottom_sheet.dart';
import '../models/report_model.dart';
import '../services/map_service.dart';
import '../utils/app_localizations.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  final MapController _mapController = MapController();
  List<Report> _reports = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _initializeMap();
  }

  Future<void> _initializeMap() async {
    try {
      await Provider.of<LocationProvider>(context, listen: false)
          .getCurrentLocation();
      await _loadReports();
    } catch (e) {
      _showErrorSnackBar('Failed to initialize map: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _loadReports() async {
    try {
      final reports = await Provider.of<ReportProvider>(context, listen: false)
          .getAllReports();
      setState(() => _reports = reports);
    } catch (e) {
      _showErrorSnackBar('Failed to load reports: $e');
    }
  }

  void _showErrorSnackBar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  Widget build(BuildContext context) {
    final locationProvider = Provider.of<LocationProvider>(context);
    final authProvider = Provider.of<AuthProvider>(context);
    final localizations = AppLocalizations.of(context);

    return Scaffold(
      appBar: CustomAppBar(
        title: localizations?.translate('app_title') ?? 'WaveNet',
        user: authProvider.currentUser,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : FlutterMap(
              mapController: _mapController,
              options: MapOptions(
                center: locationProvider.currentLocation != null
                    ? LatLng(
                        locationProvider.currentLocation!.latitude,
                        locationProvider.currentLocation!.longitude,
                      )
                    : const LatLng(16.5062, 80.6480), // Machilipatnam
                zoom: 13.0,
                onTap: _handleMapTap,
              ),
              children: [
                TileLayer(
                  urlTemplate: MapService.getMapboxTileUrl(),
                  additionalOptions: const {
                    'accessToken': MapService.mapboxAccessToken,
                    'id': 'mapbox.streets',
                  },
                ),
                MarkerLayer(
                  markers: _buildMarkers(),
                ),
                if (locationProvider.currentLocation != null)
                  MarkerLayer(
                    markers: [
                      Marker(
                        width: 40.0,
                        height: 40.0,
                        point: LatLng(
                          locationProvider.currentLocation!.latitude,
                          locationProvider.currentLocation!.longitude,
                        ),
                        builder: (ctx) => const Icon(
                          Icons.my_location,
                          color: Colors.blue,
                          size: 40.0,
                        ),
                      ),
                    ],
                  ),
              ],
            ),
      floatingActionButton: FloatingActionMenu(
        onReportPressed: () => Navigator.pushNamed(context, '/report'),
        onDashboardPressed: () => Navigator.pushNamed(context, '/dashboard'),
        onRefreshPressed: _loadReports,
      ),
    );
  }

  List<Marker> _buildMarkers() {
    return _reports.map((report) {
      return Marker(
        width: 50.0,
        height: 50.0,
        point: LatLng(report.latitude, report.longitude),
        builder: (ctx) => GestureDetector(
          onTap: () => _showReportDetails(report),
          child: Container(
            decoration: BoxDecoration(
              color: _getMarkerColor(report.hazardType),
              shape: BoxShape.circle,
              border: Border.all(color: Colors.white, width: 2),
            ),
            child: Icon(
              _getMarkerIcon(report.hazardType),
              color: Colors.white,
              size: 24,
            ),
          ),
        ),
      );
    }).toList();
  }

  Color _getMarkerColor(String hazardType) {
    switch (hazardType.toLowerCase()) {
      case 'tsunami':
        return Colors.red;
      case 'high_waves':
        return Colors.orange;
      case 'storm_surge':
        return Colors.purple;
      case 'coastal_erosion':
        return Colors.brown;
      default:
        return Colors.blue;
    }
  }

  IconData _getMarkerIcon(String hazardType) {
    switch (hazardType.toLowerCase()) {
      case 'tsunami':
        return Icons.waves;
      case 'high_waves':
        return Icons.water;
      case 'storm_surge':
        return Icons.thunderstorm;
      case 'coastal_erosion':
        return Icons.landscape;
      default:
        return Icons.warning;
    }
  }

  void _handleMapTap(TapPosition tapPosition, LatLng point) {
    // Handle map tap for quick report creation
  }

  void _showReportDetails(Report report) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => ReportBottomSheet(report: report),
    );
  }
}

// lib/screens/report_screen.dart
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';
import '../providers/report_provider.dart';
import '../providers/location_provider.dart';
import '../providers/auth_provider.dart';
import '../models/report_model.dart';
import '../utils/app_localizations.dart';

class ReportScreen extends StatefulWidget {
  const ReportScreen({super.key});

  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  
  String? _selectedHazardType;
  String? _selectedSeverity;
  List<XFile> _selectedImages = [];
  XFile? _selectedVideo;
  bool _isSubmitting = false;

  final List<String> _hazardTypes = [
    'tsunami',
    'high_waves',
    'storm_surge',
    'coastal_erosion',
    'debris',
    'pollution',
    'other'
  ];

  final List<String> _severityLevels = [
    'low',
    'medium',
    'high',
    'critical'
  ];

  @override
  Widget build(BuildContext context) {
    final localizations = AppLocalizations.of(context);
    
    return Scaffold(
      appBar: AppBar(
        title: Text(localizations?.translate('create_report') ?? 'Create Report'),
        backgroundColor: Theme.of(context).colorScheme.primaryContainer,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16.0),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        localizations?.translate('report_details') ?? 'Report Details',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _titleController,
                        decoration: InputDecoration(
                          labelText: localizations?.translate('title') ?? 'Title',
                          border: const OutlineInputBorder(),
                        ),
                        validator: (value) {
                          if (value?.isEmpty ?? true) {
                            return localizations?.translate('title_required') ?? 'Title is required';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _descriptionController,
                        decoration: InputDecoration(
                          labelText: localizations?.translate('description') ?? 'Description',
                          border: const OutlineInputBorder(),
                        ),
                        maxLines: 3,
                        validator: (value) {
                          if (value?.isEmpty ?? true) {
                            return localizations?.translate('description_required') ?? 'Description is required';
                          }
                          return null;
                        },
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        localizations?.translate('hazard_info') ?? 'Hazard Information',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 16),
                      DropdownButtonFormField<String>(
                        decoration: InputDecoration(
                          labelText: localizations?.translate('hazard_type') ?? 'Hazard Type',
                          border: const OutlineInputBorder(),
                        ),
                        value: _selectedHazardType,
                        items: _hazardTypes.map((type) {
                          return DropdownMenuItem(
                            value: type,
                            child: Text(
                              localizations?.translate(type) ?? type,
                            ),
                          );
                        }).toList(),
                        onChanged: (value) {
                          setState(() => _selectedHazardType = value);
                        },
                        validator: (value) {
                          if (value == null) {
                            return localizations?.translate('hazard_type_required') ?? 'Hazard type is required';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),
                      DropdownButtonFormField<String>(
                        decoration: InputDecoration(
                          labelText: localizations?.translate('severity') ?? 'Severity',
                          border: const OutlineInputBorder(),
                        ),
                        value: _selectedSeverity,
                        items: _severityLevels.map((severity) {
                          return DropdownMenuItem(
                            value: severity,
                            child: Text(
                              localizations?.translate(severity) ?? severity,
                            ),
                          );
                        }).toList(),
                        onChanged: (value) {
                          setState(() => _selectedSeverity = value);
                        },
                        validator: (value) {
                          if (value == null) {
                            return localizations?.translate('severity_required') ?? 'Severity is required';
                          }
                          return null;
                        },
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        localizations?.translate('media') ?? 'Media',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 16),
                      Row(
                        children: [
                          Expanded(
                            child: ElevatedButton.icon(
                              onPressed: _selectImages,
                              icon: const Icon(Icons.photo),
                              label: Text(
                                localizations?.translate('add_photos') ?? 'Add Photos',
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: ElevatedButton.icon(
                              onPressed: _selectVideo,
                              icon: const Icon(Icons.videocam),
                              label: Text(
                                localizations?.translate('add_video') ?? 'Add Video',
                              ),
                            ),
                          ),
                        ],
                      ),
                      if (_selectedImages.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        Text(
                          '${localizations?.translate('selected_images') ?? 'Selected Images'}: ${_selectedImages.length}',
                          style: Theme.of(context).textTheme.bodyMedium,
                        ),
                        const SizedBox(height: 8),
                        SizedBox(
                          height: 80,
                          child: ListView.builder(
                            scrollDirection: Axis.horizontal,
                            itemCount: _selectedImages.length,
                            itemBuilder: (context, index) {
                              return Container(
                                margin: const EdgeInsets.only(right: 8),
                                width: 80,
                                height: 80,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(8),
                                  color: Colors.grey[300],
                                ),
                                child: Stack(
                                  children: [
                                    ClipRRect(
                                      borderRadius: BorderRadius.circular(8),
                                      child: Image.network(
                                        _selectedImages[index].path,
                                        width: 80,
                                        height: 80,
                                        fit: BoxFit.cover,
                                        errorBuilder: (context, error, stackTrace) {
                                          return Container(
                                            color: Colors.grey[300],
                                            child: const Icon(Icons.image),
                                          );
                                        },
                                      ),
                                    ),
                                    Positioned(
                                      top: 4,
                                      right: 4,
                                      child: GestureDetector(
                                        onTap: () => _removeImage(index),
                                        child: Container(
                                          padding: const EdgeInsets.all(2),
                                          decoration: const BoxDecoration(
                                            color: Colors.red,
                                            shape: BoxShape.circle,
                                          ),
                                          child: const Icon(
                                            Icons.close,
                                            color: Colors.white,
                                            size: 12,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                        ),
                      ],
                      if (_selectedVideo != null) ...[
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            const Icon(Icons.videocam, color: Colors.green),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                localizations?.translate('video_selected') ?? 'Video selected',
                                style: Theme.of(context).textTheme.bodyMedium,
                              ),
                            ),
                            IconButton(
                              onPressed: () => setState(() => _selectedVideo = null),
                              icon: const Icon(Icons.delete, color: Colors.red),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _isSubmitting ? null : _submitReport,
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  backgroundColor: Theme.of(context).colorScheme.primary,
                  foregroundColor: Colors.white,
                ),
                child: _isSubmitting
                    ? const CircularProgressIndicator()
                    : Text(
                        localizations?.translate('submit_report') ?? 'Submit Report',
                        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _selectImages() async {
    final ImagePicker picker = ImagePicker();
    final List<XFile> images = await picker.pickMultiImage();
    setState(() {
      _selectedImages.addAll(images);
    });
  }

  Future<void> _selectVideo() async {
    final ImagePicker picker = ImagePicker();
    final XFile? video = await picker.pickVideo(source: ImageSource.gallery);
    if (video != null) {
      setState(() {
        _selectedVideo = video;
      });
    }
  }

  void _removeImage(int index) {
    setState(() {
      _selectedImages.removeAt(index);
    });
  }

  Future<void> _submitReport() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);

    try {
      final locationProvider = Provider.of<LocationProvider>(context, listen: false);
      final reportProvider = Provider.of<ReportProvider>(context, listen: false);
      final authProvider = Provider.of<AuthProvider>(context, listen: false);

      Position? currentPosition = locationProvider.currentLocation;
      if (currentPosition == null) {
        currentPosition = await Geolocator.getCurrentPosition();
      }

      final report = Report(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        title: _titleController.text,
        description: _descriptionController.text,
        hazardType: _selectedHazardType!,
        severity: _selectedSeverity!,
        latitude: currentPosition.latitude,
        longitude: currentPosition.longitude,
        timestamp: DateTime.now(),
        userId: authProvider.currentUser?.id ?? 'anonymous',
        images: _selectedImages.map((image) => image.path).toList(),
        videoPath: _selectedVideo?.path,
        status: 'pending',
      );

      await reportProvider.submitReport(report);

      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              AppLocalizations.of(context)?.translate('report_submitted') ?? 
              'Report submitted successfully!',
            ),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to submit report: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }
}