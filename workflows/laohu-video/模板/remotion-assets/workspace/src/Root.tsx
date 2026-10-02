import React from "react";
import {Composition, Folder, type CalculateMetadataFunction} from "remotion";
import type {ZodType} from "zod";
import {ComponentScene} from "./components";
import {componentRegistry} from "./registry/componentRegistry";
import {getComponentManifest} from "./registry/componentRegistry";
import type {ComponentConfig} from "./schemas/components";
import {scene001Examples} from "./configs/examples/scene001Examples";
import {editorialOverlayExamples} from "./configs/examples/editorialOverlayExamples";
import {flowNodeGraphExamples} from "./configs/examples/flowNodeGraphExamples";
import {h3TutorialConfigs} from "./configs/works/h3Tutorial";
import {
  Work018Overlay,
  work018DefaultProps,
  work018OverlaySchema,
  type Work018OverlayProps,
} from "./works/Work018";
import {
  SourceConverge,
  sourceConvergeDefaultProps,
  sourceConvergeSchema,
  type SourceConvergeProps,
} from "./cards/source-converge";
import {
  Work017Overlay,
  work017DefaultProps,
  work017OverlaySchema,
  type Work017OverlayProps,
} from "./works/Work017";
import {
  TypeContrastEmphasis as TypeContrastEmphasisCard,
  TypeContrastEmphasisDefaultProps as TypeContrastEmphasisDefaults,
} from "./cards/type-contrast-emphasis";
import {
  SourceConverge as SourceConvergeCard,
  SourceConvergeDefaultProps as SourceConvergeDefaults,
} from "./cards/source-converge";
import {
  WordSlotCycle as WordSlotCycleCard,
  WordSlotCycleDefaultProps as WordSlotCycleDefaults,
} from "./cards/word-slot-cycle";
import {
  ChipGridSingleSelect as ChipGridSingleSelectCard,
  ChipGridSingleSelectDefaultProps as ChipGridSingleSelectDefaults,
} from "./cards/chip-grid-single-select";
import {
  PerCharacterRise as PerCharacterRiseCard,
  PerCharacterRiseDefaultProps as PerCharacterRiseDefaults,
} from "./cards/per-character-rise";
import {
  AltBlockLines as AltBlockLinesCard,
  AltBlockLinesDefaultProps as AltBlockLinesDefaults,
} from "./cards/alt-block-lines";
import {
  LineByLineSlide as LineByLineSlideCard,
  LineByLineSlideDefaultProps as LineByLineSlideDefaults,
} from "./cards/line-by-line-slide";
import {
  TitleDemoteToLabel as TitleDemoteToLabelCard,
  TitleDemoteToLabelDefaultProps as TitleDemoteToLabelDefaults,
} from "./cards/title-demote-to-label";
import {
  NumberedStepStack as NumberedStepStackCard,
  NumberedStepStackDefaultProps as NumberedStepStackDefaults,
} from "./cards/numbered-step-stack";
import {
  StepTimelineVertical as StepTimelineVerticalCard,
  StepTimelineVerticalDefaultProps as StepTimelineVerticalDefaults,
} from "./cards/step-timeline-vertical";

const RegisteredScene: React.FC<ComponentConfig> = (props) => (
  <ComponentScene config={props} />
);

const calculateMetadata: CalculateMetadataFunction<ComponentConfig> = ({
  props,
}) => ({
  durationInFrames: props.durationInFrames,
  defaultOutName: `${props.component}-${props.mode}`,
});

const calculateWork017Metadata: CalculateMetadataFunction<Work017OverlayProps> = ({
  props,
}) => ({
  durationInFrames: props.durationInFrames,
  defaultOutName: `Work017Overlay-${props.kind}`,
});

const calculateWork018Metadata: CalculateMetadataFunction<Work018OverlayProps> = ({
  props,
}) => ({
  durationInFrames: props.durationInFrames,
  defaultOutName: `Work018Overlay-${props.kind}`,
});

const calculateSourceConvergeMetadata: CalculateMetadataFunction<SourceConvergeProps> = ({
  props,
}) => ({
  durationInFrames: props.durationInFrames,
  defaultOutName: "Work018SourceConverge",
});

export const Root: React.FC = () => {
  return (
    <>
      <Folder name="Voice2Motion-Components">
        {componentRegistry.map((manifest) => (
          <Composition
            key={manifest.id}
            id={manifest.id}
            component={RegisteredScene}
            durationInFrames={manifest.defaultProps.durationInFrames}
            fps={30}
            width={1920}
            height={1080}
            schema={manifest.schema as ZodType<ComponentConfig>}
            defaultProps={manifest.defaultProps}
            calculateMetadata={calculateMetadata}
          />
        ))}
      </Folder>
      <Folder name="Demo-Acceptance">
        {Object.entries(scene001Examples).map(([sceneId, config]) => {
          const manifest = getComponentManifest(config.component);
          return (
            <Composition
              key={sceneId}
              id={`Demo-${sceneId}`}
              component={RegisteredScene}
              durationInFrames={config.durationInFrames}
              fps={30}
              width={1920}
              height={1080}
              schema={manifest.schema as ZodType<ComponentConfig>}
              defaultProps={config}
              calculateMetadata={calculateMetadata}
            />
          );
        })}
      </Folder>
      <Folder name="Demo-Editorial-Overlay">
        {Object.entries(editorialOverlayExamples).map(([sceneId, config]) => {
          const manifest = getComponentManifest(config.component);
          return (
            <Composition
              key={sceneId}
              id={`Editorial-${sceneId}`}
              component={RegisteredScene}
              durationInFrames={config.durationInFrames}
              fps={30}
              width={1920}
              height={1080}
              schema={manifest.schema as ZodType<ComponentConfig>}
              defaultProps={config}
              calculateMetadata={calculateMetadata}
            />
          );
        })}
      </Folder>
      <Folder name="Demo-Flow-Topology">
        {Object.entries(flowNodeGraphExamples).map(([sceneId, config]) => {
          const manifest = getComponentManifest(config.component);
          return (
            <Composition
              key={sceneId}
              id={`Flow-${sceneId}`}
              component={RegisteredScene}
              durationInFrames={config.durationInFrames}
              fps={30}
              width={1920}
              height={1080}
              schema={manifest.schema as ZodType<ComponentConfig>}
              defaultProps={config}
              calculateMetadata={calculateMetadata}
            />
          );
        })}
      </Folder>
      <Folder name="Work-015-H3-Tutorial">
        {Object.entries(h3TutorialConfigs).map(([sceneId, config]) => {
          const manifest = getComponentManifest(config.component);
          return (
            <Composition
              key={sceneId}
              id={`H3-${sceneId}`}
              component={RegisteredScene}
              durationInFrames={config.durationInFrames}
              fps={30}
              width={1920}
              height={1080}
              schema={manifest.schema as ZodType<ComponentConfig>}
              defaultProps={config}
              calculateMetadata={calculateMetadata}
            />
          );
        })}
      </Folder>
      <Folder name="Work-018-Overlays">
        <Composition
          id="Work018Overlay"
          component={Work018Overlay}
          durationInFrames={work018DefaultProps.durationInFrames}
          fps={30}
          width={1920}
          height={1080}
          schema={work018OverlaySchema}
          defaultProps={work018DefaultProps}
          calculateMetadata={calculateWork018Metadata}
        />
        <Composition
          id="Work018SourceConverge"
          component={SourceConverge}
          durationInFrames={sourceConvergeDefaultProps.durationInFrames}
          fps={30}
          width={1920}
          height={1080}
          schema={sourceConvergeSchema}
          defaultProps={sourceConvergeDefaultProps}
          calculateMetadata={calculateSourceConvergeMetadata}
        />
        <Composition
          id="CardStepTimelineVertical"
          component={StepTimelineVerticalCard}
          durationInFrames={StepTimelineVerticalDefaults.durationInFrames}
          fps={30}
          width={1920}
          height={1080}
          calculateMetadata={({ props }: { props: { durationInFrames: number } }) => ({
            durationInFrames: props.durationInFrames,
            defaultOutName: "CardStepTimelineVertical",
          })}
        />
        <Composition
          id="CardTypeContrastEmphasis"
          component={TypeContrastEmphasisCard}
          durationInFrames={TypeContrastEmphasisDefaults.durationInFrames}
          fps={30}
          width={1920}
          height={1080}
          calculateMetadata={({ props }: { props: { durationInFrames: number } }) => ({
            durationInFrames: props.durationInFrames,
            defaultOutName: "CardTypeContrastEmphasis",
          })}
        />
        <Composition
          id="CardSourceConverge"
          component={SourceConvergeCard}
          durationInFrames={SourceConvergeDefaults.durationInFrames}
          fps={30}
          width={1920}
          height={1080}
          calculateMetadata={({ props }: { props: { durationInFrames: number } }) => ({
            durationInFrames: props.durationInFrames,
            defaultOutName: "CardSourceConverge",
          })}
        />
        <Composition
          id="CardWordSlotCycle"
          component={WordSlotCycleCard}
          durationInFrames={WordSlotCycleDefaults.durationInFrames}
          fps={30}
          width={1920}
          height={1080}
          calculateMetadata={({ props }: { props: { durationInFrames: number } }) => ({
            durationInFrames: props.durationInFrames,
            defaultOutName: "CardWordSlotCycle",
          })}
        />
        <Composition
          id="CardChipGridSingleSelect"
          component={ChipGridSingleSelectCard}
          durationInFrames={ChipGridSingleSelectDefaults.durationInFrames}
          fps={30}
          width={1920}
          height={1080}
          calculateMetadata={({ props }: { props: { durationInFrames: number } }) => ({
            durationInFrames: props.durationInFrames,
            defaultOutName: "CardChipGridSingleSelect",
          })}
        />
        <Composition
          id="CardPerCharacterRise"
          component={PerCharacterRiseCard}
          durationInFrames={PerCharacterRiseDefaults.durationInFrames}
          fps={30}
          width={1920}
          height={1080}
          calculateMetadata={({ props }: { props: { durationInFrames: number } }) => ({
            durationInFrames: props.durationInFrames,
            defaultOutName: "CardPerCharacterRise",
          })}
        />
        <Composition
          id="CardAltBlockLines"
          component={AltBlockLinesCard}
          durationInFrames={AltBlockLinesDefaults.durationInFrames}
          fps={30}
          width={1920}
          height={1080}
          calculateMetadata={({ props }: { props: { durationInFrames: number } }) => ({
            durationInFrames: props.durationInFrames,
            defaultOutName: "CardAltBlockLines",
          })}
        />
        <Composition
          id="CardLineByLineSlide"
          component={LineByLineSlideCard}
          durationInFrames={LineByLineSlideDefaults.durationInFrames}
          fps={30}
          width={1920}
          height={1080}
          calculateMetadata={({ props }: { props: { durationInFrames: number } }) => ({
            durationInFrames: props.durationInFrames,
            defaultOutName: "CardLineByLineSlide",
          })}
        />
        <Composition
          id="CardTitleDemoteToLabel"
          component={TitleDemoteToLabelCard}
          durationInFrames={TitleDemoteToLabelDefaults.durationInFrames}
          fps={30}
          width={1920}
          height={1080}
          calculateMetadata={({ props }: { props: { durationInFrames: number } }) => ({
            durationInFrames: props.durationInFrames,
            defaultOutName: "CardTitleDemoteToLabel",
          })}
        />
        <Composition
          id="CardNumberedStepStack"
          component={NumberedStepStackCard}
          durationInFrames={NumberedStepStackDefaults.durationInFrames}
          fps={30}
          width={1920}
          height={1080}
          calculateMetadata={({ props }: { props: { durationInFrames: number } }) => ({
            durationInFrames: props.durationInFrames,
            defaultOutName: "CardNumberedStepStack",
          })}
        />

      </Folder>
      <Folder name="Work-017-Overlays">
        <Composition
          id="Work017Overlay"
          component={Work017Overlay}
          durationInFrames={work017DefaultProps.durationInFrames}
          fps={30}
          width={1920}
          height={1080}
          schema={work017OverlaySchema}
          defaultProps={work017DefaultProps}
          calculateMetadata={calculateWork017Metadata}
        />
      </Folder>
    </>
  );
};
