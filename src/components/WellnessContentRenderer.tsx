import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface WellnessContentRendererProps {
  content: Record<string, any>;
  colorGradient?: string;
}

const gradientColors: Record<string, { primary: string; light: string }> = {
  'from-purple-400 to-violet-500': { primary: '#8b5cf6', light: '#f3e8ff' },
  'from-green-400 to-emerald-500': { primary: '#10b981', light: '#d1fae5' },
  'from-orange-400 to-amber-500': { primary: '#f59e0b', light: '#fef3c7' },
  'from-blue-400 to-cyan-500': { primary: '#06b6d4', light: '#cffafe' },
  'from-rose-400 to-pink-500': { primary: '#ec4899', light: '#fce7f3' },
  'from-gray-400 to-slate-500': { primary: '#64748b', light: '#f1f5f9' },
};

export default function WellnessContentRenderer({
  content,
  colorGradient,
}: WellnessContentRendererProps) {
  const sections = content.sections || [];
  const colors = gradientColors[colorGradient || ''] || { primary: '#ec4899', light: '#fce7f3' };

  const renderSection = (section: any, index: number) => {
    switch (section.type) {
      case 'header':
        return (
          <View key={index} style={[styles.headerSection, { backgroundColor: colors.light }]}>
            {section.icon && <Text style={styles.headerIcon}>{section.icon}</Text>}
            <Text style={styles.headerTitle}>{section.title}</Text>
            {section.subtitle && (
              <Text style={[styles.headerSubtitle, { color: colors.primary }]}>
                {section.subtitle}
              </Text>
            )}
          </View>
        );

      case 'intro':
      case 'disclaimer':
        return (
          <View
            key={index}
            style={[
              styles.introSection,
              section.type === 'disclaimer' && styles.disclaimerSection,
            ]}
          >
            <Text style={styles.introText}>{section.text}</Text>
          </View>
        );

      case 'symptoms':
      case 'tips':
      case 'avoid':
      case 'signs':
      case 'causes':
      case 'exercises':
      case 'routine':
      case 'conversation': {
        const iconEmojis: Record<string, string> = {
          symptoms: '💭',
          tips: '✨',
          avoid: '🚫',
          signs: '⚠️',
          causes: '❓',
          exercises: '💪',
          routine: '🏃‍♀️',
          conversation: '💬',
        };
        const dotColors: Record<string, string> = {
          avoid: '#f87171',
          symptoms: '#fda4af',
          default: '#4ade80',
        };
        const dotColor = dotColors[section.type] || dotColors.default;

        return (
          <View key={index} style={styles.listSection}>
            <View style={styles.listHeader}>
              <Text style={styles.listEmoji}>{iconEmojis[section.type]}</Text>
              <Text style={styles.listTitle}>{section.title}</Text>
            </View>
            {section.items?.map((item: string, i: number) => (
              <View key={i} style={styles.listItem}>
                <View style={[styles.listDot, { backgroundColor: dotColor }]} />
                <Text style={styles.listItemText}>{item}</Text>
              </View>
            ))}
          </View>
        );
      }
      case 'training':
        return (
          <View key={index} style={styles.listSection}>
            <View style={styles.listHeader}>
              <Text style={styles.listEmoji}>⚽</Text>
              <Text style={styles.listTitle}>{section.title}</Text>
            </View>
            <View style={styles.trainingGrid}>
              {section.cardio && (
                <View style={[styles.trainingCard, { backgroundColor: '#dbeafe' }]}>
                  <Text style={[styles.trainingLabel, { color: '#2563eb' }]}>
                    {section.cardio.label}
                  </Text>
                  {section.cardio.items?.map((item: string, i: number) => (
                    <Text key={i} style={styles.trainingItem}>{item}</Text>
                  ))}
                </View>
              )}
              {section.strength && (
                <View style={[styles.trainingCard, { backgroundColor: '#f3e8ff' }]}>
                  <Text style={[styles.trainingLabel, { color: '#7c3aed' }]}>
                    {section.strength.label}
                  </Text>
                  {section.strength.items?.map((item: string, i: number) => (
                    <Text key={i} style={styles.trainingItem}>{item}</Text>
                  ))}
                </View>
              )}
            </View>
          </View>
        );

      case 'fueling':
        return (
          <View key={index} style={styles.listSection}>
            <View style={styles.listHeader}>
              <Text style={styles.listEmoji}>🍎</Text>
              <Text style={styles.listTitle}>{section.title}</Text>
            </View>
            {section.items?.map((item: string, i: number) => (
              <Text key={i} style={styles.fuelingItem}>{item}</Text>
            ))}
          </View>
        );

      case 'warning':
        return (
          <View key={index} style={styles.warningSection}>
            <View style={styles.warningHeader}>
              <Text style={styles.warningEmoji}>{section.icon || '⚠️'}</Text>
              <Text style={styles.warningTitle}>{section.title}</Text>
            </View>
            <Text style={styles.warningText}>{section.text}</Text>
          </View>
        );

      case 'takeaway':
        return (
          <View key={index} style={styles.takeawaySection}>
            <Text style={styles.takeawayEmoji}>{section.icon || '💡'}</Text>
            <View style={styles.takeawayContent}>
              <Text style={styles.takeawayTitle}>Key Takeaway</Text>
              <Text style={styles.takeawayText}>{section.text}</Text>
            </View>
          </View>
        );

      case 'checklist':
        return (
          <View key={index} style={styles.listSection}>
            <View style={styles.listHeader}>
              <Text style={styles.listEmoji}>✅</Text>
              <Text style={styles.listTitle}>{section.title}</Text>
            </View>
            {section.items?.map((item: string, i: number) => (
              <View key={i} style={styles.checklistItem}>
                <Text style={styles.checkboxEmpty}>☐</Text>
                <Text style={styles.listItemText}>{item}</Text>
              </View>
            ))}
          </View>
        );

      case 'timeline':
        return (
          <View key={index} style={styles.listSection}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items?.map((item: any, i: number) => (
              <View key={i} style={styles.timelineItem}>
                <View style={styles.timelineBadge}>
                  <Text style={styles.timelineTime}>{item.time}</Text>
                </View>
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineLabel}>{item.label}</Text>
                  <Text style={styles.timelineExamples}>{item.examples}</Text>
                </View>
              </View>
            ))}
          </View>
        );

      case 'comparison':
        return (
          <View key={index} style={styles.listSection}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items?.map((item: any, i: number) => (
              <View key={i} style={styles.comparisonCard}>
                <Text style={styles.comparisonName}>{item.name}</Text>
                <View style={styles.comparisonGrid}>
                  <View style={styles.comparisonColumn}>
                    <Text style={styles.prosLabel}>Pros</Text>
                    {item.pros?.map((pro: string, j: number) => (
                      <Text key={j} style={styles.prosItem}>+ {pro}</Text>
                    ))}
                  </View>
                  <View style={styles.comparisonColumn}>
                    <Text style={styles.consLabel}>Cons</Text>
                    {item.cons?.map((con: string, j: number) => (
                      <Text key={j} style={styles.consItem}>- {con}</Text>
                    ))}
                  </View>
                </View>
                {item.best_for && (
                  <Text style={styles.bestFor}>Best for: {item.best_for}</Text>
                )}
              </View>
            ))}
          </View>
        );

      case 'phases':
        return (
          <View key={index} style={styles.listSection}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items?.map((item: any, i: number) => {
              const riskColors: Record<string, { bg: string; border: string; text: string }> = {
                HIGHEST: { bg: '#fee2e2', border: '#f87171', text: '#dc2626' },
                LOWER: { bg: '#dcfce7', border: '#4ade80', text: '#16a34a' },
                MODERATE: { bg: '#fef9c3', border: '#facc15', text: '#ca8a04' },
              };
              const riskStyle = riskColors[item.risk] || riskColors.MODERATE;

              return (
                <View
                  key={i}
                  style={[
                    styles.phaseCard,
                    { backgroundColor: riskStyle.bg, borderLeftColor: riskStyle.border },
                  ]}
                >
                  <View style={styles.phaseHeader}>
                    <Text style={styles.phaseName}>{item.phase}</Text>
                    <View style={[styles.riskBadge, { backgroundColor: riskStyle.border }]}>
                      <Text style={[styles.riskText, { color: '#fff' }]}>{item.risk}</Text>
                    </View>
                  </View>
                  <Text style={styles.phaseNotes}>{item.notes}</Text>
                </View>
              );
            })}
          </View>
        );

      case 'priority':
      case 'stats':
      case 'ratio':
        return (
          <View key={index} style={styles.prioritySection}>
            <Text style={styles.priorityTitle}>{section.title}</Text>
            <Text style={styles.priorityText}>{section.text}</Text>
            {(section.items || section.examples || section.foods)?.map((item: string, i: number) => (
              <Text key={i} style={styles.priorityItem}>• {item}</Text>
            ))}
          </View>
        );

      case 'immediate':
        return (
          <View key={index} style={styles.immediateSection}>
            <Text style={styles.immediateTitle}>{section.title}</Text>
            {section.items?.map((item: string, i: number) => (
              <Text key={i} style={styles.immediateItem}>{item}</Text>
            ))}
          </View>
        );

      case 'reframe':
        return (
          <View key={index} style={styles.listSection}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items?.map((item: any, i: number) => (
              <View key={i} style={styles.reframeRow}>
                <View style={styles.reframeNegative}>
                  <Text style={styles.reframeLabel}>Instead of:</Text>
                  <Text style={styles.reframeText}>{item.negative}</Text>
                </View>
                <Text style={styles.reframeArrow}>→</Text>
                <View style={styles.reframePositive}>
                  <Text style={styles.reframeLabelPositive}>Think:</Text>
                  <Text style={styles.reframeText}>{item.positive}</Text>
                </View>
              </View>
            ))}
          </View>
        );

      case 'resources':
        return (
          <View key={index} style={styles.listSection}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items?.map((item: any, i: number) => (
              <View key={i} style={styles.resourceCard}>
                <Text style={styles.resourceName}>{item.name}</Text>
                <Text style={styles.resourceDesc}>{item.description}</Text>
                {item.url && <Text style={styles.resourceUrl}>{item.url}</Text>}
              </View>
            ))}
          </View>
        );

      case 'warning_signs':
        return (
          <View key={index} style={styles.warningSignsSection}>
            <Text style={styles.warningSignsTitle}>{section.title}</Text>
            {section.items?.map((item: string, i: number) => (
              <View key={i} style={styles.warningSignItem}>
                <Text style={styles.warningSignEmoji}>⚠️</Text>
                <Text style={styles.warningSignText}>{item}</Text>
              </View>
            ))}
          </View>
        );

      case 'effects':
        return (
          <View key={index} style={styles.listSection}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.effectsGrid}>
              {section.positive && (
                <View style={styles.effectsPositive}>
                  <Text style={styles.effectsLabel}>Potential Benefits</Text>
                  {section.positive.map((item: string, i: number) => (
                    <Text key={i} style={styles.effectsItem}>+ {item}</Text>
                  ))}
                </View>
              )}
              {section.negative && (
                <View style={styles.effectsNegative}>
                  <Text style={styles.effectsLabelNeg}>Possible Concerns</Text>
                  {section.negative.map((item: string, i: number) => (
                    <Text key={i} style={styles.effectsItemNeg}>- {item}</Text>
                  ))}
                </View>
              )}
            </View>
          </View>
        );

      case 'types':
      case 'questions':
        return (
          <View key={index} style={styles.listSection}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items?.map((item: any, i: number) => (
              <View key={i} style={styles.typeCard}>
                {typeof item === 'string' ? (
                  <Text style={styles.typeText}>{item}</Text>
                ) : (
                  <>
                    <Text style={styles.typeName}>{item.type}</Text>
                    <Text style={styles.typeDesc}>{item.description}</Text>
                  </>
                )}
              </View>
            ))}
          </View>
        );

      case 'tip':
        return (
          <View key={index} style={styles.tipSection}>
            <Text style={styles.tipTitle}>{section.title}</Text>
            <Text style={styles.tipText}>{section.text}</Text>
          </View>
        );

      default:
        return null;
    }
  };

  return <View style={styles.container}>{sections.map(renderSection)}</View>;
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  // Header section
  headerSection: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  headerIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  headerSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  // Intro section
  introSection: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 16,
  },
  disclaimerSection: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  introText: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 22,
  },
  // List sections
  listSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  listEmoji: {
    fontSize: 20,
    marginRight: 8,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  listDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    marginRight: 10,
  },
  listItemText: {
    flex: 1,
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
  },
  // Training section
  trainingGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  trainingCard: {
    flex: 1,
    borderRadius: 10,
    padding: 12,
  },
  trainingLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  trainingItem: {
    fontSize: 13,
    color: '#374151',
    marginBottom: 2,
  },
  // Fueling section
  fuelingItem: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 6,
    lineHeight: 20,
  },
  // Warning section
  warningSection: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  warningEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400e',
  },
  warningText: {
    fontSize: 14,
    color: '#a16207',
    lineHeight: 20,
  },
  // Takeaway section
  takeawaySection: {
    flexDirection: 'row',
    backgroundColor: '#fefce8',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  takeawayEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  takeawayContent: {
    flex: 1,
  },
  takeawayTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  takeawayText: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
  },
  // Checklist
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  checkboxEmpty: {
    fontSize: 16,
    color: '#10b981',
    marginRight: 8,
    marginTop: -2,
  },
  // Timeline
  timelineItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  timelineBadge: {
    backgroundColor: '#dbeafe',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 12,
  },
  timelineTime: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2563eb',
  },
  timelineContent: {
    flex: 1,
  },
  timelineLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  timelineExamples: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  // Comparison
  comparisonCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  comparisonName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  comparisonGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  comparisonColumn: {
    flex: 1,
  },
  prosLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
    marginBottom: 4,
  },
  prosItem: {
    fontSize: 12,
    color: '#4b5563',
    marginBottom: 2,
  },
  consLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dc2626',
    marginBottom: 4,
  },
  consItem: {
    fontSize: 12,
    color: '#4b5563',
    marginBottom: 2,
  },
  bestFor: {
    fontSize: 12,
    color: '#2563eb',
    marginTop: 8,
  },
  // Phases
  phaseCard: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
  },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  phaseName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
  },
  riskBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  riskText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  phaseNotes: {
    fontSize: 12,
    color: '#4b5563',
  },
  // Priority/Stats
  prioritySection: {
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  priorityTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 6,
  },
  priorityText: {
    fontSize: 14,
    color: '#1e3a8a',
    marginBottom: 8,
  },
  priorityItem: {
    fontSize: 13,
    color: '#2563eb',
    marginBottom: 2,
  },
  // Immediate (crisis)
  immediateSection: {
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  immediateTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#991b1b',
    marginBottom: 8,
  },
  immediateItem: {
    fontSize: 14,
    fontWeight: '600',
    color: '#b91c1c',
    marginBottom: 4,
  },
  // Reframe
  reframeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  reframeNegative: {
    flex: 1,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    padding: 10,
  },
  reframePositive: {
    flex: 1,
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    padding: 10,
  },
  reframeLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#dc2626',
    marginBottom: 4,
  },
  reframeLabelPositive: {
    fontSize: 10,
    fontWeight: '600',
    color: '#16a34a',
    marginBottom: 4,
  },
  reframeText: {
    fontSize: 12,
    color: '#374151',
  },
  reframeArrow: {
    fontSize: 16,
    color: '#9ca3af',
  },
  // Resources
  resourceCard: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  resourceName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  resourceDesc: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  resourceUrl: {
    fontSize: 11,
    color: '#2563eb',
    marginTop: 4,
  },
  // Warning signs
  warningSignsSection: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  warningSignsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400e',
    marginBottom: 12,
  },
  warningSignItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  warningSignEmoji: {
    fontSize: 14,
    marginRight: 8,
  },
  warningSignText: {
    flex: 1,
    fontSize: 14,
    color: '#a16207',
  },
  // Effects
  effectsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  effectsPositive: {
    flex: 1,
    backgroundColor: '#dcfce7',
    borderRadius: 10,
    padding: 12,
  },
  effectsNegative: {
    flex: 1,
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    padding: 12,
  },
  effectsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#16a34a',
    marginBottom: 6,
  },
  effectsLabelNeg: {
    fontSize: 11,
    fontWeight: '600',
    color: '#dc2626',
    marginBottom: 6,
  },
  effectsItem: {
    fontSize: 11,
    color: '#4b5563',
    marginBottom: 2,
  },
  effectsItemNeg: {
    fontSize: 11,
    color: '#4b5563',
    marginBottom: 2,
  },
  // Types/Questions
  typeCard: {
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  typeName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  typeDesc: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  typeText: {
    fontSize: 14,
    color: '#374151',
  },
  // Tip
  tipSection: {
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  tipTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 4,
  },
  tipText: {
    fontSize: 14,
    color: '#1e3a8a',
  },
  // Generic
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
});
