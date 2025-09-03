#!/usr/bin/env python3

import json
import os
from google.cloud import dialogflow

def create_entity_type(project_id, entity_data):
    """Create an entity type in DialogFlow."""
    client = dialogflow.EntityTypesClient()
    parent = f"projects/{project_id}/agent"
    
    entity_type = dialogflow.EntityType(
        display_name=entity_data['displayName'],
        kind=getattr(dialogflow.EntityType.Kind, entity_data['kind']),
        entities=[
            dialogflow.EntityType.Entity(
                value=entity['value'],
                synonyms=entity['synonyms']
            ) for entity in entity_data['entities']
        ]
    )
    
    try:
        response = client.create_entity_type(
            request={"parent": parent, "entity_type": entity_type}
        )
        print(f"✓ Created entity type: {entity_data['displayName']}")
        return response
    except Exception as e:
        print(f"✗ Error creating entity type {entity_data['displayName']}: {e}")
        return None

def create_intent(project_id, intent_data):
    """Create an intent in DialogFlow."""
    client = dialogflow.IntentsClient()
    parent = f"projects/{project_id}/agent"
    
    # Convert training phrases
    training_phrases = []
    for phrase_data in intent_data.get('trainingPhrases', []):
        parts = []
        for part in phrase_data['parts']:
            text_part = dialogflow.Intent.TrainingPhrase.Part(text=part['text'])
            if 'entityType' in part:
                text_part.entity_type = part['entityType']
                text_part.alias = part.get('alias', part['text'])
            parts.append(text_part)
        
        training_phrases.append(
            dialogflow.Intent.TrainingPhrase(parts=parts)
        )
    
    # Convert parameters
    parameters = []
    for param_data in intent_data.get('parameters', []):
        parameters.append(
            dialogflow.Intent.Parameter(
                display_name=param_data['displayName'],
                value=param_data['value'],
                entity_type_display_name=param_data['entityTypeDisplayName'],
                mandatory=param_data.get('mandatory', False),
                prompts=param_data.get('prompts', [])
            )
        )
    
    # Convert messages
    messages = []
    for msg_data in intent_data.get('messages', []):
        if 'text' in msg_data:
            messages.append(
                dialogflow.Intent.Message(
                    text=dialogflow.Intent.Message.Text(
                        text=msg_data['text']['text']
                    )
                )
            )
    
    intent = dialogflow.Intent(
        display_name=intent_data['displayName'],
        training_phrases=training_phrases,
        parameters=parameters,
        messages=messages,
        priority=intent_data.get('priority', 500000),
        ml_disabled=intent_data.get('mlDisabled', False),
        reset_contexts=intent_data.get('resetContexts', False)
    )
    
    try:
        response = client.create_intent(
            request={"parent": parent, "intent": intent}
        )
        print(f"✓ Created intent: {intent_data['displayName']}")
        return response
    except Exception as e:
        print(f"✗ Error creating intent {intent_data['displayName']}: {e}")
        return None

def main():
    """Main function to upload all intents and entities."""
    project_id = os.environ.get('GOOGLE_CLOUD_PROJECT', 'enterprise-banking-chatbot')
    
    print(f"Uploading to DialogFlow project: {project_id}")
    
    # Create entities first
    entities_dir = './config/entities'
    if os.path.exists(entities_dir):
        print("\n🔧 Creating entities...")
        for filename in os.listdir(entities_dir):
            if filename.endswith('.json'):
                filepath = os.path.join(entities_dir, filename)
                with open(filepath, 'r') as file:
                    entity_data = json.load(file)
                    create_entity_type(project_id, entity_data)
    
    # Create intents
    intents_dir = './config/intents'
    if os.path.exists(intents_dir):
        print("\n🎯 Creating intents...")
        for filename in os.listdir(intents_dir):
            if filename.endswith('.json'):
                filepath = os.path.join(intents_dir, filename)
                with open(filepath, 'r') as file:
                    intent_data = json.load(file)
                    create_intent(project_id, intent_data)
    
    print("\n✅ DialogFlow setup complete!")
    print("\nNext steps:")
    print("1. Test your intents in the DialogFlow console")
    print("2. Train your agent with additional examples")
    print("3. Update your ChatBot UI environment variables")
    print(f"4. Set GOOGLE_PROJECT_ID={project_id} in your .env file")

if __name__ == "__main__":
    main()
