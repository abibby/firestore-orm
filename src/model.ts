import { QueryBuilder } from './query-builder'
/// <reference lib="dom" />
import * as firebase from 'firebase'

export interface FieldOptions {
    readonly?: boolean
}

export interface StaticModel<T extends Model> {
    options: { [field: string]: FieldOptions | undefined }
    new(): T
}

export abstract class Model {
    public static options: { [field: string]: FieldOptions | undefined }

    public static builder<T extends Model>(this: StaticModel<T>): QueryBuilder<T> {
        const m = new this()
        return new QueryBuilder(this, m.collection)
    }

    public static async find<T extends Model>(this: StaticModel<T>, id: string): Promise<T | null> {
        const m = new this()
        const doc = await m.collection.doc(id).get()
        Object.assign(m, {
            ...doc.data(),
            id: doc.id,
        })
        m.postSave()
        return m
    }

    public static subscribe<T extends Model>(
        this: StaticModel<T>,
        id: string,
        callback: (models: T) => void,
    ): () => void {
        return (new this()).collection.doc(id).onSnapshot(doc => {
            const m = new this()
            Object.assign(m, {
                ...doc.data(),
                id: doc.id,
            })
            m.postSave()
            callback(m)
        })
    }

    public static field(options: FieldOptions = {}): (type: Model, f: string) => void {
        return (type, f) => {
            const constructor = type.constructor as StaticModel<Model>
            if (constructor.options === undefined) {
                constructor.options = {}
            }
            constructor.options[f] = options
            return {
                get: function (this: Model): any {
                    if (this.attributes.hasOwnProperty(f)) {
                        return this.attributes[f]
                    }
                    return this.original[f]
                },
                set: function (this: Model, value: any): void {
                    if (this.original[f] === value) {
                        delete this.attributes[f]
                    } else {
                        this.attributes[f] = value
                    }
                },
            }
        }
    }

    public readonly id: string | undefined

    public abstract readonly collection: firebase.firestore.CollectionReference

    private original: { [key: string]: any } = {}
    private attributes: { [key: string]: any } = {}

    public async save(): Promise<void> {
        const saveObject: any = {}

        this.saving()

        for (const key of Object.keys((this.constructor as StaticModel<Model>).options)) {
            const value = (this as any)[key]
            const options = (this.constructor as StaticModel<Model>).options[key]
            if (value === undefined) {
                continue
            }
            if (options?.readonly) {
                continue
            }
            saveObject[key] = value
        }

        if (this.id === undefined) {
            const docRef = await this.collection.add(saveObject);
            (this as any).id = docRef.id
        } else {
            await this.collection.doc(this.id).set(saveObject, { merge: true })
        }
        this.postSave()
        this.saved()
    }
    public postSave(): void {
        this.original = {
            ...this.original,
            ...this.attributes,
        }
        this.attributes = {}

    }
    public async delete(): Promise<void> {
        this.deleting()
        if (this.id === undefined) {
            return
        }
        await this.collection.doc(this.id).delete()
        this.deleted()
    }

    public hasChanges(): boolean {
        return Object.keys(this.attributes).length > 0
    }

    public toJSON(): unknown {
        return {
            ...this.original,
            ...this.attributes,
        }
    }

    protected saving(): void {
        // this should stay empty
    }
    protected saved(): void {
        // this should stay empty
    }
    protected deleting(): void {
        // this should stay empty
    }
    protected deleted(): void {
        // this should stay empty
    }
}
