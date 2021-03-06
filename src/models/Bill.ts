import { Column, Entity, PrimaryGeneratedColumn, ManyToOne, ManyToMany, JoinTable, OneToMany, BeforeInsert, AfterLoad } from 'typeorm';
import { User } from './User';
import { TransactionRequest } from './TransactionRequest';
import { BillWeight } from './BillWeight';
import { Group } from './Group';
import { bigIntToNumber } from '../util/PostGresUtil';

@Entity({ name: "bills" })
export class Bill {
    @PrimaryGeneratedColumn('uuid')
    public id: string;

    @Column({default: ""})
    public description: string;

    @Column({type: "bigint"})
    public dateCreated: number;

    // totalXrp is stored in drops; 1 xrp is 1 million drops
    @Column({ type: "bigint"})
    public totalXrpDrops: number;

    @ManyToOne(() => User, user => user.ownedBills, {
        eager: true
    })
    public creditor: User;

    @ManyToOne(() => Group, group => group.bills)
    public group: Group;

    @ManyToMany(() => User, {
        eager: true
    })
    @JoinTable()
    public participants: User[];

    @OneToMany(() => TransactionRequest, tr => tr.bill, {
        eager: true
    })
    public transactionRequests: TransactionRequest[];

    @OneToMany(() => BillWeight, bw => bw.bill, {
        eager: true
    })
    public weights: BillWeight[];

    @BeforeInsert()
    public setDateCreated(): void {
        this.dateCreated = Date.now();
    }

    @AfterLoad()
    convertBalanceToNumber(): void {
        this.totalXrpDrops = bigIntToNumber(this.totalXrpDrops);
        this.dateCreated = bigIntToNumber(this.dateCreated);
    }
}