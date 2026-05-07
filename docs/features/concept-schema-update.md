# Concept schema update

We are planning a new "Outline" feature where the user would be able to work on creating outlines related to their Subjects. We want to be able to pregenerate these outlines based on the concepts metadata.

So for each subject we want to be able to pregenerate these outlines based on the concept Topic and Subtopic metadata.

However, we have two issues. The first is that the Topic concept metadata can have many topics or topic elements. In cases where a concept has many topics, creating an outline would be chaotic. We need to update our app and schema so that for the Topic metadata, users are able to add only one topic per concept. So the Concept Topic must be many to one (if i understand correctly, so one Concept can only have one topic, but a Topic may have many concepts)

this introduces a further problem, I have been working on a testing account which aleady has hundreds of concepts, each with relevant topics, most of these concepts only have one topic. So during this update we want to preserve the data for these topics, in the rare case where a concept may have more than one topic we could try to preserve the first topic element on the list, or if that is not possible in these cases we could remove the topics from the database altogether.. but if a concept has only one topic assigned to it, then we must preserve the data, so in the new schema structure, we should save the existing topic for each concept. this is super important, as this work would be lost if we simply remove the topic data in this migration. we do not want to lose any data, except potentially Topic data on concepts that may have more than one topic assigned to them (ideally we would keep the first topic element in this scenario).

With this update the new concept modal should be updated so that the Topic input element only allows adding one topic per concept instead of many, the user should still be able to create or search and select, but he should only be able to either create a new one or select an existing one (but not both actions). if he either adds a new or selects an existing one the state of the input element should be updated so that he understands that only one is allowed.

The second issue is that our schema does not include a Subtopic object as of right now. We would have to create this object, it would likewise have a Many to One relationship with the concept object (so a concept can only have one Subtopic, but a Subtopic can have many concepts). in this case there is no danger of losing data during the migration, as there is no data available for this object.

We would then need to update the new concept modal so that below the Topic input element and above the Tags input element we would have a the new Subtopic input element which should work exactly like the Topic input element. Neither of these input elements (Topic or Subtopic) is required.

Once changes are finished we should be able to do a proper database migration and hopefully not lose the existing topic data in either local or prod environments.

Please create a plan to best work on these updates, feel free to include things that i may be missing, expand on these ideas, or push back if part of it does not make sense.

With these updates we should also update relevant documentation such as our claude.md file and our architecture documentation or any other relevant documentation to reflect the latest state.
