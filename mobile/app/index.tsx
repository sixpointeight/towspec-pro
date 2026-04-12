import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors } from '@/constants/colors';
import SectionCard from '@/components/SectionCard';
import LockoutCard from '@/components/LockoutCard';
import { decodeVin, searchVehicles, fetchProcedure } from '@/lib/api';
import type { VinInfo, Vehicle, Procedure } from '@/lib/api';

function fuelColor(ft: string) {
  const f = ft.toLowerCase();
  if (f.includes('electric')) return '#22c55e';
  if (f.includes('hybrid')) return '#14b8a6';
  if (f.includes('diesel')) return '#f97316';
  if (f.includes('hydrogen')) return '#a855f7';
  return '#64748b';
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [vin, setVin] = useState('');
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef(false);

  const [decoding, setDecoding] = useState(false);
  const [vinInfo, setVinInfo] = useState<VinInfo | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [noResults, setNoResults] = useState(false);

  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const [procLoading, setProcLoading] = useState(false);
  const [procedure, setProcedure] = useState<Procedure | null>(null);
  const [procError, setProcError] = useState<string | null>(null);

  const [globalError, setGlobalError] = useState<string | null>(null);

  async function handleVin(vinStr: string) {
    const v = vinStr.trim().toUpperCase();
    if (v.length !== 17) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDecoding(true);
    setGlobalError(null);
    setVinInfo(null);
    setVehicles([]);
    setNoResults(false);
    setProcedure(null);
    setProcError(null);
    setSelectedIdx(-1);

    try {
      const info = await decodeVin(v);
      setVinInfo(info);
      const year = parseInt(info.ModelYear);
      if (year && info.Make && info.Model) {
        const matches = await searchVehicles(year, info.Make, info.Model);
        setVehicles(matches);
        setNoResults(matches.length === 0);
        if (matches.length === 1) {
          loadProcedure(matches[0], 0);
        }
      }
    } catch {
      setGlobalError('Could not decode VIN. Check your connection and try again.');
    } finally {
      setDecoding(false);
    }
  }

  async function loadProcedure(vehicle: Vehicle, idx: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIdx(idx);
    setProcLoading(true);
    setProcedure(null);
    setProcError(null);
    try {
      const proc = await fetchProcedure(vehicle.url);
      setProcedure(proc);
    } catch {
      setProcError('Failed to load procedure. Check that the backend server is running.');
    } finally {
      setProcLoading(false);
    }
  }

  async function openScanner() {
    if (Platform.OS === 'web') {
      setGlobalError('Camera scanning is only available in the Expo Go app on your device.');
      return;
    }
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    scannedRef.current = false;
    setScanning(true);
  }

  function handleBarcode(data: string) {
    if (scannedRef.current) return;
    if (data.length === 17) {
      scannedRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScanning(false);
      setVin(data);
      handleVin(data);
    }
  }

  const sectionKeys = Object.keys(procedure?.sections ?? {});

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>
              TOWSPEC <Text style={styles.headerAccent}>PRO</Text>
            </Text>
            <Text style={styles.headerSub}>ROADSIDE ASSISTANCE DATABASE</Text>
          </View>
          <View style={styles.dbBadge}>
            <Text style={styles.dbBadgeText}>16,218 VEH</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.searchCard}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={vin}
                onChangeText={v => setVin(v.toUpperCase())}
                placeholder="ENTER 17-DIGIT VIN..."
                placeholderTextColor={colors.textMuted}
                maxLength={17}
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                returnKeyType="search"
                onSubmitEditing={() => handleVin(vin)}
              />
              <Pressable style={styles.scanBtn} onPress={openScanner}>
                <Ionicons name="camera" size={22} color={colors.primaryForeground} />
              </Pressable>
            </View>

            <Pressable
              style={[styles.lookupBtn, vin.length !== 17 && styles.lookupBtnDisabled]}
              onPress={() => handleVin(vin)}
              disabled={vin.length !== 17 || decoding}
            >
              {decoding ? (
                <ActivityIndicator color={colors.primaryForeground} size="small" />
              ) : (
                <Text style={styles.lookupBtnText}>LOOK UP VIN</Text>
              )}
            </Pressable>

            {globalError && (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={14} color="#fca5a5" />
                <Text style={styles.errorText}>{globalError}</Text>
              </View>
            )}
          </View>

          {vinInfo && (
            <View style={styles.vehicleCard}>
              <Text style={styles.vehicleMono}>{vin}</Text>
              <Text style={styles.vehicleName}>
                {vinInfo.ModelYear} {vinInfo.Make} {vinInfo.Model}
              </Text>
              <View style={styles.badgeRow}>
                {vinInfo.DriveType ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{vinInfo.DriveType.toUpperCase()}</Text>
                  </View>
                ) : null}
                {vinInfo.FuelTypePrimary ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{vinInfo.FuelTypePrimary.toUpperCase()}</Text>
                  </View>
                ) : null}
                {vinInfo.BodyClass ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{vinInfo.BodyClass.toUpperCase()}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          )}

          {vehicles.length > 0 && (
            <View style={styles.variantsCard}>
              <Text style={styles.variantsTitle}>
                {vehicles.length} AAA RSI{' '}
                {vehicles.length === 1 ? 'Configuration' : 'Configurations'} Found
              </Text>
              {vehicles.map((v, i) => (
                <Pressable
                  key={i}
                  style={[styles.variantBtn, selectedIdx === i && styles.variantBtnActive]}
                  onPress={() => loadProcedure(v, i)}
                >
                  <View style={styles.variantLeft}>
                    <Text style={styles.variantDrive}>{v.drivetrain}</Text>
                    <View style={[styles.fuelBadge, { backgroundColor: fuelColor(v.fuelType) }]}>
                      <Text style={styles.fuelBadgeText}>{v.fuelType.toUpperCase()}</Text>
                    </View>
                  </View>
                  {procLoading && selectedIdx === i ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : selectedIdx === i && procedure ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  )}
                </Pressable>
              ))}
            </View>
          )}

          {noResults && vinInfo && (
            <View style={styles.noResults}>
              <Ionicons name="search" size={32} color={colors.textMuted} />
              <Text style={styles.noResultsTitle}>No AAA RSI Procedure Found</Text>
              <Text style={styles.noResultsSub}>Default to flatbed recovery</Text>
            </View>
          )}

          {procError && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={14} color="#fca5a5" />
              <Text style={styles.errorText}>{procError}</Text>
            </View>
          )}

          {procedure && (
            <View style={styles.procedureSection}>
              <Text style={styles.procedureLabel}>AAA RSI PROCEDURE DATA</Text>

              {sectionKeys.map(key => (
                <SectionCard
                  key={key}
                  heading={key}
                  content={procedure.sections![key]}
                  towPics={key === 'Tow Information' ? procedure.towPics : undefined}
                />
              ))}

              {procedure.lockout && <LockoutCard lockout={procedure.lockout} />}
            </View>
          )}

          {!vinInfo && !decoding && (
            <View style={styles.placeholder}>
              <Ionicons name="car-sport" size={48} color={colors.border} />
              <Text style={styles.placeholderText}>
                Scan a VIN barcode or enter{'\n'}manually to look up towing procedures
              </Text>
              <Pressable style={styles.scanHint} onPress={openScanner}>
                <Ionicons name="camera-outline" size={16} color={colors.primary} />
                <Text style={styles.scanHintText}>Tap to scan barcode</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>

        <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
          <View style={[styles.scannerModal, { paddingTop: insets.top }]}>
            <View style={styles.scannerHeader}>
              <Text style={styles.scannerTitle}>ALIGN VIN BARCODE</Text>
              <Pressable onPress={() => setScanning(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.scannerViewport}>
              <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                onBarcodeScanned={({ data }) => handleBarcode(data)}
                barcodeScannerSettings={{ barcodeTypes: ['code128', 'code39'] }}
              />
              <View style={styles.scanFrame} />
            </View>

            <Text style={styles.scannerHint}>Scanning for Code 128 / Code 39</Text>
          </View>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.5,
  },
  headerAccent: {
    color: colors.primary,
  },
  headerSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 9,
    color: colors.textMuted,
    letterSpacing: 2,
    marginTop: 1,
  },
  dbBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  dbBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: colors.primaryForeground,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },

  searchCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius,
    padding: 14,
    gap: 10,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.text,
    letterSpacing: 1,
  },
  scanBtn: {
    backgroundColor: colors.primary,
    width: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lookupBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  lookupBtnDisabled: {
    opacity: 0.35,
  },
  lookupBtnText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: colors.primaryForeground,
    letterSpacing: 1,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#1c0808',
    borderRadius: 8,
    padding: 10,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#fca5a5',
    flex: 1,
    lineHeight: 18,
  },

  vehicleCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius,
    padding: 16,
  },
  vehicleMono: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 4,
  },
  vehicleName: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: colors.text,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  badge: {
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },

  variantsCard: {
    backgroundColor: colors.surface,
    borderRadius: colors.radius,
    padding: 14,
    gap: 8,
  },
  variantsTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  variantBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
  },
  variantBtnActive: {
    borderColor: colors.primary,
    backgroundColor: '#1c1a08',
  },
  variantLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  variantDrive: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: colors.text,
  },
  fuelBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  fuelBadgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 10,
    color: '#fff',
  },

  noResults: {
    alignItems: 'center',
    padding: 32,
    gap: 8,
  },
  noResultsTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: colors.textSecondary,
  },
  noResultsSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  procedureSection: {
    gap: 0,
  },
  procedureLabel: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    color: colors.textMuted,
    letterSpacing: 2,
    marginBottom: 10,
  },

  placeholder: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  placeholderText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  scanHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  scanHintText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: colors.primary,
  },

  scannerModal: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  scannerTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    color: colors.text,
    letterSpacing: 2,
  },
  closeBtn: {
    padding: 4,
  },
  scannerViewport: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  scanFrame: {
    position: 'absolute',
    top: '25%',
    left: '10%',
    right: '10%',
    bottom: '25%',
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: 12,
  },
  scannerHint: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
    letterSpacing: 1,
    fontStyle: 'italic',
  },
});
